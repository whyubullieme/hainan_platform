// cloudfunctions/teacher_saveReview/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const MAX_COMMENT_LENGTH = 500;

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
    throw new Error('仅班级教师可点评');
  }
  return true;
}

async function ensureStudentInClass({ classId, studentId }) {
  const studentMemberRes = await db.collection('class_members')
    .where({ classId, userId: studentId, roleInClass: 'student', status: 'active' })
    .limit(1)
    .get();
  if (!studentMemberRes.data || studentMemberRes.data.length === 0) {
    throw new Error('学生不在当前班级');
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

function normalizeComment(comment) {
  if (typeof comment !== 'string') {
    return null;
  }
  const trimmed = comment.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return trimmed.slice(0, MAX_COMMENT_LENGTH);
  }
  return trimmed;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, studentId, dayNumber, comment } = event;

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }
  if (!classId || typeof classId !== 'string') {
    return { errCode: -1, errMsg: '缺少 classId' };
  }
  if (!studentId || typeof studentId !== 'string') {
    return { errCode: -1, errMsg: '缺少 studentId' };
  }
  const parsedDayNumber = parseDayNumber(dayNumber);
  if (!parsedDayNumber) {
    return { errCode: -1, errMsg: 'dayNumber 无效' };
  }
  const normalizedComment = normalizeComment(comment);
  if (!normalizedComment) {
    return { errCode: -1, errMsg: '点评内容不能为空' };
  }

  try {
    const teacher = await getUserByOpenid(openid);
    if (!teacher) {
      return { errCode: -1, errMsg: '请先登录' };
    }

    const cls = await getClassById(classId);
    if (!cls) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    await ensureTeacherAccess({ classId, userId: teacher._id, userRole: teacher.role });
    await ensureStudentInClass({ classId, studentId });

    const now = new Date();
    const baseFilter = {
      classId,
      studentId,
      dayNumber: parsedDayNumber,
      teacherId: teacher._id,
    };

    const existingRes = await db.collection('reviews')
      .where(baseFilter)
      .limit(1)
      .get();
    const teacherName = teacher.name || teacher.realName || teacher.nickname || '';

    if (existingRes.data && existingRes.data.length > 0) {
      const reviewId = existingRes.data[0]._id;
      await db.collection('reviews').doc(reviewId).update({
        data: {
          comment: normalizedComment,
          teacherName,
          updatedAt: now,
        },
      });
      return { errCode: 0, errMsg: 'success', reviewId, ok: true };
    }

    const addRes = await db.collection('reviews').add({
      data: {
        ...baseFilter,
        teacherName,
        comment: normalizedComment,
        createdAt: now,
        updatedAt: now,
      },
    });

    return { errCode: 0, errMsg: 'success', reviewId: addRes._id, ok: true };
  } catch (error) {
    console.error('teacher_saveReview error:', error);
    return { errCode: -1, errMsg: error.message || '保存失败' };
  }
};
