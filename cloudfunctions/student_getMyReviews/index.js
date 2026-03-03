// cloudfunctions/student_getMyReviews/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 学生：获取老师给我的点评列表
 * 入参: { classId }
 * 出参: { reviews: [{ dayNumber, comment, teacherName, createdAt }] }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const classId = event.classId;

  if (!openid || !classId) {
    return { errCode: -1, errMsg: '参数缺少 classId' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    const reviewRes = await db.collection('reviews')
      .where({ classId, studentId: userId })
      .orderBy('createdAt', 'desc')
      .get();

    const reviews = (reviewRes.data || []).map(r => ({
      _id: r._id,
      dayNumber: r.dayNumber,
      comment: r.comment || '',
      teacherName: r.teacherName || '老师',
      createdAt: r.updatedAt || r.createdAt
    }));

    return { errCode: 0, errMsg: 'success', reviews };
  } catch (error) {
    console.error('student_getMyReviews:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
