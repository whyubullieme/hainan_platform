const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

async function ensureTeacherAccess({ classId, userId, userRole }) {
  if (userRole === 'admin') {
    return true;
  }
  const teacherMemberRes = await db.collection('class_members')
    .where({ classId, userId, roleInClass: 'teacher', status: 'active' })
    .limit(1)
    .get();
  if (!teacherMemberRes.data || teacherMemberRes.data.length === 0) {
    throw new Error('仅班级教师可查看提交');
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

function pickAudioFileId(submission = {}) {
  return (
    submission.audioFileId
    || submission.audiofileId
    || submission.fileId
    || submission.voiceFileId
    || ''
  );
}

function pickAudioFileName(submission = {}) {
  return (
    submission.audioFileName
    || submission.audioFilename
    || submission.fileName
    || submission.voiceFileName
    || ''
  );
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, studentId, dayNumber } = event;

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

  try {
    const teacher = await getUserByOpenid(openid);
    if (!teacher) {
      return { errCode: -1, errMsg: '请先登录' };
    }

    await ensureTeacherAccess({ classId, userId: teacher._id, userRole: teacher.role });

    const [taskRes, subRes] = await Promise.all([
      db.collection('task_items')
        .where({ classId, dayNumber: parsedDayNumber })
        .field({ _id: true, title: true, order: true })
        .orderBy('order', 'asc')
        .get(),
      db.collection('submissions')
        .where({ classId, userId: studentId, dayNumber: parsedDayNumber })
        .orderBy('createdAt', 'desc')
        .get(),
    ]);

    const dayTasks = taskRes.data || [];
    const submissions = subRes.data || [];

    const taskMap = {};
    dayTasks.forEach((t) => {
      taskMap[t._id] = t.title || '任务';
    });

    const itemsBase = submissions.map((s) => {
      const audioFileId = pickAudioFileId(s);
      const audioFileName = pickAudioFileName(s);
      return {
        _id: s._id,
        taskItemId: s.taskItemId || '',
        taskTitle: taskMap[s.taskItemId] || '任务',
        note: s.note || '',
        audioFileId,
        audioFileName,
        createdAt: s.createdAt,
        evaluationStatus: s.evaluationStatus || 'pending',
        asrText: s.asrText || '',
        semanticScore: s.semanticScore,
        pronScore: s.pronScore,
        finalScore: s.finalScore,
        semanticPassed: s.semanticPassed,
        pronDetails: s.pronDetails || null,
        evaluationError: s.evaluationError || null,
        needsRedo: !!s.needsRedo,
        redoComment: s.redoComment || ''
      };
    });

    const audioIds = [...new Set(itemsBase.map((item) => item.audioFileId).filter(Boolean))];
    const audioTempUrlMap = {};
    if (audioIds.length > 0) {
      try {
        const tempRes = await cloud.getTempFileURL({
          fileList: audioIds.map((fileID) => ({ fileID, maxAge: 60 * 60 })),
        });
        (tempRes.fileList || []).forEach((file) => {
          if (!file.fileID || !file.tempFileURL) return;
          if (file.status === 0 || file.status === '0' || file.status === undefined) {
            audioTempUrlMap[file.fileID] = file.tempFileURL;
          }
        });
      } catch (tempErr) {
        console.error('teacher_getStudentSubmissions getTempFileURL error:', tempErr);
      }
    }

    const items = itemsBase.map((item) => ({
      ...item,
      audioTempUrl: item.audioFileId ? (audioTempUrlMap[item.audioFileId] || '') : '',
    }));

    const submittedTaskSet = new Set(itemsBase.map((item) => item.taskItemId).filter(Boolean));
    const dayTaskCount = dayTasks.length;
    const submittedTaskCount = submittedTaskSet.size;

    return {
      errCode: 0,
      errMsg: 'success',
      items,
      dayTaskCount,
      submittedTaskCount,
      allTaskDone: dayTaskCount > 0 && submittedTaskCount >= dayTaskCount,
    };
  } catch (error) {
    console.error('teacher_getStudentSubmissions error:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
