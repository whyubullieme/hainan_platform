// cloudfunctions/teacher_listStudentsByStatus/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const BATCH_LIMIT = 100;

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
    throw new Error('仅班级教师可查看名单');
  }
  return true;
}

function parseDayNumber(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function normalizeStatus(status) {
  if (status === 'missing' || status === 'done' || status === 'reviewed') {
    return status;
  }
  return null;
}

function chunkIds(ids) {
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    batches.push(ids.slice(i, i + BATCH_LIMIT));
  }
  return batches;
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

async function fetchActiveStudentMembers(classId) {
  return fetchAllDocs('class_members', { classId, roleInClass: 'student', status: 'active' });
}

async function fetchUserNameMap(userIds) {
  const uniqueIds = Array.from(new Set((userIds || []).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const batches = chunkIds(uniqueIds).map((batch) => db.collection('users')
    .where({ _id: _.in(batch) })
    .field({ _id: true, name: true, nickname: true, realName: true })
    .get());
  const results = await Promise.all(batches);
  const map = new Map();
  results.forEach((res) => {
    (res.data || []).forEach((doc) => {
      const displayName = doc.name || doc.realName || doc.nickname || '';
      map.set(doc._id, displayName || doc._id);
    });
  });
  return map;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, dayNumber, status } = event;

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }
  if (!classId || typeof classId !== 'string') {
    return { errCode: -1, errMsg: '缺少 classId' };
  }
  const normalizedStatus = normalizeStatus(status);
  if (!normalizedStatus) {
    return { errCode: -1, errMsg: 'status 仅支持 missing/done/reviewed' };
  }
  const parsedDayNumber = parseDayNumber(dayNumber);
  if (!parsedDayNumber) {
    return { errCode: -1, errMsg: 'dayNumber 无效' };
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

    const members = await fetchActiveStudentMembers(classId);
    if (members.length === 0) {
      return { errCode: 0, errMsg: 'success', students: [] };
    }

    const studentIds = members.map((item) => item.userId).filter(Boolean);
    if (studentIds.length === 0) {
      return { errCode: 0, errMsg: 'success', students: [] };
    }

    const [checkins, submissions, reviews] = await Promise.all([
      fetchAllDocs('checkins', { classId, dayNumber: parsedDayNumber }, { userId: true }),
      fetchAllDocs('submissions', { classId, dayNumber: parsedDayNumber }, { userId: true, needsRedo: true }),
      fetchAllDocs('reviews', { classId, dayNumber: parsedDayNumber }, { studentId: true, reviewAction: true }),
    ]);

    const checkedSet = new Set((checkins || []).map((doc) => doc.userId));
    const submittedSet = new Set((submissions || [])
      .filter((doc) => !doc.needsRedo)
      .map((doc) => doc.userId));
    const reviewedSet = new Set((reviews || [])
      .filter((doc) => doc.reviewAction !== 'redo')
      .map((doc) => doc.studentId));

    const nameMap = await fetchUserNameMap(studentIds);

    const students = [];
    members.forEach((member) => {
      const userId = member.userId;
      if (!userId) {
        return;
      }
      const hasCheckin = checkedSet.has(userId);
      const hasSubmission = submittedSet.has(userId);
      const hasReview = reviewedSet.has(userId);
      let currentStatus = 'missing';
      if (hasSubmission && hasReview) {
        currentStatus = 'reviewed';
      } else if (hasSubmission) {
        currentStatus = 'done';
      }
      if (currentStatus === normalizedStatus) {
        const displayName = nameMap.get(userId) || member.displayName || member.name || '';
        students.push({
          userId,
          name: displayName,
          status: currentStatus,
          hasCheckin,
          hasSubmission,
          hasReview,
        });
      }
    });

    return { errCode: 0, errMsg: 'success', students };
  } catch (error) {
    console.error('teacher_listStudentsByStatus error:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
