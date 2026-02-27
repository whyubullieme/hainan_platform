// cloudfunctions/teacher_getOverview/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calcDayNumber(startDateStr, targetDateStr) {
  if (!targetDateStr) {
    return 1;
  }
  const targetDate = new Date(targetDateStr);
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
    return 1;
  }
  if (!startDateStr) {
    return 1;
  }
  const startDate = new Date(startDateStr);
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    return 1;
  }
  const diffMs = targetDate.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const dayNumber = diffDays + 1;
  return dayNumber < 1 ? 1 : dayNumber;
}

async function countStudents(classId) {
  const res = await db.collection('class_members')
    .where({ classId, roleInClass: 'student', status: 'active' })
    .count();
  return res.total || 0;
}

async function countDistinctByField(collectionName, filter, fieldName) {
  try {
    const aggRes = await db.collection(collectionName)
      .aggregate()
      .match(filter)
      .group({ _id: `$${fieldName}` })
      .count('count')
      .end();
    if (aggRes && aggRes.list && aggRes.list.length > 0) {
      return aggRes.list[0].count || 0;
    }
    return 0;
  } catch (error) {
    console.warn(`[teacher_getOverview] aggregate fallback for ${collectionName}:`, error.message);
    const res = await db.collection(collectionName)
      .where(filter)
      .get();
    const uniq = new Set((res.data || []).map(item => item[fieldName]).filter(Boolean));
    return uniq.size;
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId } = event || {};
  let { dayNumber, date } = event || {};

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }
  if (!classId) {
    return { errCode: -1, errMsg: '缺少 classId' };
  }

  try {
    const userRes = await db.collection('users')
      .where({ openid })
      .limit(1)
      .get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const user = userRes.data[0];
    const userId = user._id;

    const classDoc = await db.collection('classes').doc(classId).get();
    if (!classDoc.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }
    const cls = classDoc.data;

    const teacherMemberRes = await db.collection('class_members')
      .where({ classId, userId, roleInClass: 'teacher', status: 'active' })
      .limit(1)
      .get();
    if ((!teacherMemberRes.data || teacherMemberRes.data.length === 0) && user.role !== 'admin') {
      return { errCode: -1, errMsg: '仅班级教师可查看概览' };
    }

    let resolvedDayNumber = parseInt(dayNumber, 10);
    if (!resolvedDayNumber || Number.isNaN(resolvedDayNumber)) {
      const targetDate = date || formatDate(new Date());
      resolvedDayNumber = calcDayNumber(cls.startDate, targetDate);
    }
    if (resolvedDayNumber < 1) {
      resolvedDayNumber = 1;
    }

    const totalStudents = await countStudents(classId);
    const baseFilter = { classId, dayNumber: resolvedDayNumber };
    const checkedInCount = await countDistinctByField('checkins', baseFilter, 'userId');
    const submittedCount = await countDistinctByField('submissions', baseFilter, 'userId');
    const reviewedCount = await countDistinctByField('reviews', baseFilter, 'studentId');

    return {
      errCode: 0,
      errMsg: 'success',
      totalStudents,
      checkedInCount,
      submittedCount,
      reviewedCount,
    };
  } catch (error) {
    console.error('teacher_getOverview error:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
