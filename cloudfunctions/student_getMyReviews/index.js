// cloudfunctions/student_getMyReviews/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const DAY_MS = 24 * 60 * 60 * 1000;

function parseYMDToUTC(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function addDaysUTC(date, days) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + (days * DAY_MS));
}

function formatYMDFromUTC(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 学生：获取老师给我的点评列表
 * 入参: { classId }
 * 出参: { reviews: [{ dayNumber, dateStr, comment, teacherName, createdAt }] }
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
    const classRes = await db.collection('classes').doc(classId).get();
    const classData = classRes.data || {};
    const startDate = parseYMDToUTC(classData.startDate);

    const reviewRes = await db.collection('reviews')
      .where({ classId, studentId: userId })
      .orderBy('createdAt', 'desc')
      .get();

    const reviews = (reviewRes.data || []).map(r => ({
      dayNumber: r.dayNumber,
      dateStr: startDate ? formatYMDFromUTC(addDaysUTC(startDate, Math.max(1, (r.dayNumber || 1)) - 1)) : '',
      _id: r._id,
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
