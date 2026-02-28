// cloudfunctions/teacher_getOverview/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const BATCH_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDate(input) {
  if (!input) {
    return null;
  }
  const date = input instanceof Date ? new Date(input) : new Date(String(input));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function resolveDayNumber(startDateStr, requestedDayNumber, requestedDate) {
  const parsedDay = Number.parseInt(requestedDayNumber, 10);
  if (!Number.isNaN(parsedDay) && parsedDay >= 1) {
    return parsedDay;
  }
  const startDate = normalizeDate(startDateStr);
  if (!startDate) {
    return 1;
  }
  const targetDate = normalizeDate(requestedDate) || normalizeDate(new Date());
  if (!targetDate) {
    return 1;
  }
  const diffDays = Math.floor((targetDate.getTime() - startDate.getTime()) / DAY_MS);
  const dayNumber = diffDays + 1;
  return dayNumber < 1 ? 1 : dayNumber;
}

async function getUserByOpenid(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get();
  if (!userRes.data || userRes.data.length === 0) {
    return null;
  }
  return userRes.data[0];
}

async function getClassById(classId) {
  const classDoc = await db.collection('classes').doc(classId).get();
  return classDoc.data || null;
}

async function ensureTeacherAccess({ classId, userId, userRole }) {
  if (userRole === 'admin') {
    return true;
  }
  const teacherMemberRes = await db.collection('class_members')
    .where({ classId, userId, roleInClass: 'teacher', status: 'active' })
    .limit(1)
    .get();
  if (!teacherMemberRes.data || teacherMemberRes.data.length === 0) {
    throw new Error('仅班级教师可查看概览');
  }
  return true;
}

async function countStudents(classId) {
  const res = await db.collection('class_members')
    .where({ classId, roleInClass: 'student', status: 'active' })
    .count();
  return res.total || 0;
}

async function fetchAllDocs(collectionName, filter, projection) {
  const all = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = db.collection(collectionName)
      .where(filter)
      .skip(skip)
      .limit(BATCH_LIMIT);
    if (projection) {
      query = query.field(projection);
    }
    // eslint-disable-next-line no-await-in-loop
    const res = await query.get();
    const data = res.data || [];
    all.push(...data);
    if (data.length < BATCH_LIMIT) {
      break;
    }
    skip += BATCH_LIMIT;
  }
  return all;
}

async function countDistinctByField(collectionName, filter, fieldName) {
  try {
    const aggRes = await db.collection(collectionName)
      .aggregate()
      .match(filter)
      .group({ _id: `$${fieldName}` })
      .count('count')
      .end();
    if (aggRes && Array.isArray(aggRes.list) && aggRes.list.length > 0) {
      return aggRes.list[0].count || 0;
    }
    return 0;
  } catch (error) {
    console.warn(`[teacher_getOverview] aggregate fallback for ${collectionName}:`, error.message);
    const records = await fetchAllDocs(collectionName, filter, { [fieldName]: true });
    const uniq = new Set(records.map((item) => item[fieldName]).filter(Boolean));
    return uniq.size;
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, dayNumber, date } = event;

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }
  if (!classId || typeof classId !== 'string') {
    return { errCode: -1, errMsg: '缺少 classId' };
  }

  try {
    const user = await getUserByOpenid(openid);
    if (!user) {
      return { errCode: -1, errMsg: '请先登录' };
    }

    const cls = await getClassById(classId);
    if (!cls) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    await ensureTeacherAccess({ classId, userId: user._id, userRole: user.role });

    const resolvedDayNumber = resolveDayNumber(cls.startDate, dayNumber, date);
    const baseFilter = { classId, dayNumber: resolvedDayNumber };

    const [totalStudents, checkedInCount, submittedCount, reviewedCount] = await Promise.all([
      countStudents(classId),
      countDistinctByField('checkins', baseFilter, 'userId'),
      countDistinctByField('submissions', baseFilter, 'userId'),
      countDistinctByField('reviews', baseFilter, 'studentId'),
    ]);

    return {
      errCode: 0,
      errMsg: 'success',
      totalStudents,
      checkedInCount,
      submittedCount,
      reviewedCount,
      dayNumber: resolvedDayNumber,
    };
  } catch (error) {
    console.error('teacher_getOverview error:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
