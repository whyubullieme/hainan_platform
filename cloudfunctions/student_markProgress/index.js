// cloudfunctions/student_markProgress/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DAY_MS = 24 * 60 * 60 * 1000;

function parseYMDToUTC(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUTC(date, days) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + (days * DAY_MS));
}

/**
 * 签到 + 提交 合并接口
 * 打卡: { classId, dayNumber, action: "checkin" }
 * 提交: { classId, dayNumber, action: "submit", taskItemId, note? }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, dayNumber, action } = event;

  if (!openid || !classId || !dayNumber || !action) {
    return { errCode: -1, errMsg: '参数缺少 classId, dayNumber, action' };
  }

  const parsedDayNumber = Number.parseInt(dayNumber, 10);
  if (Number.isNaN(parsedDayNumber) || parsedDayNumber < 1) {
    return { errCode: -1, errMsg: 'dayNumber 无效' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    // 校验当前用户是否属于该班级
    const memberRes = await db.collection('class_members')
      .where({ classId, userId, status: 'active' })
      .limit(1)
      .get();
    if (!memberRes.data || memberRes.data.length === 0) {
      return { errCode: -1, errMsg: '当前用户不属于该班级，无法操作进度' };
    }

    if (action === 'checkin') {
      // 签到：upsert checkins（同一用户同一天约定一条记录）
      const exist = await db.collection('checkins')
        .where({ classId, userId, dayNumber: parsedDayNumber })
        .limit(1)
        .get();
      if (exist.data && exist.data.length > 0) {
        return { errCode: 0, errMsg: 'success', ok: true };
      }
      await db.collection('checkins').add({
        data: {
          classId,
          userId,
          dayNumber: parsedDayNumber,
          status: 'done',
          createdAt: db.serverDate()
        }
      });
    } else if (action === 'submit') {
      const { taskItemId, note } = event;
      if (!taskItemId) {
        return { errCode: -1, errMsg: '提交需要 taskItemId' };
      }

      // 校验任务是否属于该班级 & 对应天数，防止篡改
      const taskDoc = await db.collection('task_items').doc(taskItemId).get();
      if (!taskDoc.data) {
        return { errCode: -1, errMsg: '任务不存在' };
      }
      const task = taskDoc.data;
      if (task.classId !== classId || Number(task.dayNumber) !== parsedDayNumber) {
        return { errCode: -1, errMsg: '任务不属于当前班级或日期，无法提交' };
      }

      // 不允许超前做作业（仅允许今日及已过去的日期），使用 UTC 规避时区偏移
      const classRes = await db.collection('classes').doc(classId).get();
      if (classRes.data) {
        const startDate = classRes.data.startDate || '';
        const start = parseYMDToUTC(startDate);
        if (!start) {
          return { errCode: -1, errMsg: '班级开始日期无效，无法校验进度' };
        }
        const targetDayDate = addDaysUTC(start, parsedDayNumber - 1);
        if (!targetDayDate) {
          return { errCode: -1, errMsg: '任务日期计算失败' };
        }

        const now = new Date();
        const todayUTC = new Date(Date.UTC(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ));

        if (targetDayDate.getTime() > todayUTC.getTime()) {
          return { errCode: -1, errMsg: '该任务尚未开放，请按课程进度完成' };
        }
      }

      // 避免重复提交（同一用户同一天同一任务）
      const exist = await db.collection('submissions')
        .where({ classId, userId, dayNumber: parsedDayNumber, taskItemId })
        .limit(1)
        .get();
      if (exist.data && exist.data.length > 0) {
        return { errCode: 0, errMsg: 'success', ok: true };
      }
      await db.collection('submissions').add({
        data: {
          classId,
          userId,
          dayNumber: parsedDayNumber,
          taskItemId,
          channel: 'wechat_group',
          note: note || '',
          status: 'recorded',
          createdAt: db.serverDate()
        }
      });
    } else {
      return { errCode: -1, errMsg: 'action 需为 checkin 或 submit' };
    }

    return { errCode: 0, errMsg: 'success', ok: true };
  } catch (error) {
    console.error('student_markProgress:', error);
    return { errCode: -1, errMsg: error.message || '操作失败' };
  }
};
