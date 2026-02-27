// cloudfunctions/student_markProgress/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    if (action === 'checkin') {
      // 签到：upsert checkins（同一用户同一天可多条，简化为一条约定：dayNumber 唯一）
      const exist = await db.collection('checkins')
        .where({ classId, userId, dayNumber })
        .limit(1)
        .get();
      if (exist.data && exist.data.length > 0) {
        return { errCode: 0, errMsg: 'success', ok: true };
      }
      await db.collection('checkins').add({
        data: {
          classId,
          userId,
          dayNumber,
          status: 'done',
          createdAt: db.serverDate()
        }
      });
    } else if (action === 'submit') {
      const { taskItemId, note } = event;
      if (!taskItemId) {
        return { errCode: -1, errMsg: '提交需要 taskItemId' };
      }
      // 避免重复提交（同一用户同一天同一任务）
      const exist = await db.collection('submissions')
        .where({ classId, userId, dayNumber, taskItemId })
        .limit(1)
        .get();
      if (exist.data && exist.data.length > 0) {
        return { errCode: 0, errMsg: 'success', ok: true };
      }
      await db.collection('submissions').add({
        data: {
          classId,
          userId,
          dayNumber,
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
