const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDate(input) {
  if (!input) return null;
  const d = new Date(String(input));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveDayNumber(startDateStr, inputDayNumber, inputDate) {
  const parsedDay = Number.parseInt(inputDayNumber, 10);
  if (!Number.isNaN(parsedDay) && parsedDay >= 1) {
    return parsedDay;
  }
  const startDate = normalizeDate(startDateStr);
  const targetDate = normalizeDate(inputDate);
  if (!startDate || !targetDate) {
    return null;
  }
  const diffDays = Math.floor((targetDate.getTime() - startDate.getTime()) / DAY_MS);
  const dayNumber = diffDays + 1;
  return dayNumber >= 1 ? dayNumber : null;
}

/**
 * 教师：撤销某一天的全部任务（删除该班级当日的 task_items）
 * 入参: { classId, dayNumber?, date? }
 * 出参: { errCode, errMsg }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, dayNumber, date } = event;

  if (!openid || !classId || (!dayNumber && !date)) {
    return { errCode: -1, errMsg: '参数缺少 classId 和操作日期/天数' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    const memberRes = await db.collection('class_members')
      .where({ classId, userId, roleInClass: 'teacher', status: 'active' })
      .limit(1)
      .get();

    if (!memberRes.data || memberRes.data.length === 0) {
      const user = userRes.data[0];
      if (user.role !== 'admin') {
        return { errCode: -1, errMsg: '仅班级教师可操作' };
      }
    }

    const classRes = await db.collection('classes').doc(classId).get();
    if (!classRes.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    if (date && !normalizeDate(date)) {
      return { errCode: -1, errMsg: 'date 格式无效，应为 YYYY-MM-DD' };
    }

    const resolvedDay = resolveDayNumber(classRes.data.startDate, dayNumber, date);
    if (!resolvedDay) {
      return { errCode: -1, errMsg: '无法根据该日期解析到有效课程序号' };
    }

    const toDeleteRes = await db.collection('task_items')
      .where({ classId, dayNumber: resolvedDay })
      .get();
    const items = toDeleteRes.data || [];

    if (items.length === 0) {
      return { errCode: 0, errMsg: '当日暂无任务可撤销', deleted: 0, dayNumber: resolvedDay };
    }

    // CloudBase 一次 remove 至少能覆盖这些小数量的任务
    await db.collection('task_items').where({ classId, dayNumber: resolvedDay }).remove();

    return { errCode: 0, errMsg: 'success', deleted: items.length, dayNumber: resolvedDay };
  } catch (error) {
    console.error('teacher_revokeDayTasks:', error);
    return { errCode: -1, errMsg: error.message || '撤销失败' };
  }
};
