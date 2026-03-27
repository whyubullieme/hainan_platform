// cloudfunctions/teacher_getTopErrors/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const BATCH_LIMIT = 100;

// Words scoring below this threshold are considered mispronounced
const WORD_ERROR_THRESHOLD = 60;

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
    throw new Error('仅班级教师可查看错题分析');
  }
  return true;
}

async function fetchAllDocs(collectionName, filter, projection) {
  const all = [];
  let skip = 0;
  while (true) {
    let query = db.collection(collectionName)
      .where(filter)
      .skip(skip)
      .limit(BATCH_LIMIT);
    if (projection) {
      query = query.field(projection);
    }
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId } = event;

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

    await ensureTeacherAccess({ classId, userId: user._id, userRole: user.role });

    // Fetch all completed submissions for this class
    const submissions = await fetchAllDocs('submissions', {
      classId,
      evaluationStatus: 'completed',
    }, {
      taskItemId: true,
      finalScore: true,
      pronScore: true,
      semanticScore: true,
      pronDetails: true,
    });

    if (submissions.length === 0) {
      return {
        errCode: 0,
        topTasks: [],
        topErrorWords: [],
      };
    }

    // --- Aggregate by taskItemId ---
    const taskAgg = {}; // taskItemId -> { totalFinal, totalPron, totalSemantic, count }
    const errorWordAgg = {}; // word -> { count, errorTypes }

    for (const sub of submissions) {
      const tid = sub.taskItemId;
      if (!tid) continue;

      // Accumulate task scores
      if (!taskAgg[tid]) {
        taskAgg[tid] = { totalFinal: 0, totalPron: 0, totalSemantic: 0, count: 0 };
      }
      const agg = taskAgg[tid];
      agg.totalFinal += (typeof sub.finalScore === 'number' ? sub.finalScore : 0);
      agg.totalPron += (typeof sub.pronScore === 'number' ? sub.pronScore : 0);
      agg.totalSemantic += (typeof sub.semanticScore === 'number' ? sub.semanticScore : 0);
      agg.count += 1;

      // Aggregate error words from pronDetails.words
      const words = sub.pronDetails && Array.isArray(sub.pronDetails.words)
        ? sub.pronDetails.words
        : [];
      for (const w of words) {
        if (!w || !w.word) continue;
        const wordText = String(w.word).trim().toLowerCase();
        if (!wordText) continue;

        // A word is an error if it has an explicit errorType or a low score
        const hasErrorType = w.errorType && typeof w.errorType === 'string';
        const hasLowScore = typeof w.score === 'number' && w.score < WORD_ERROR_THRESHOLD;

        if (hasErrorType || hasLowScore) {
          if (!errorWordAgg[wordText]) {
            errorWordAgg[wordText] = { count: 0, errorTypes: {} };
          }
          errorWordAgg[wordText].count += 1;
          const errType = hasErrorType ? w.errorType : 'low_score';
          errorWordAgg[wordText].errorTypes[errType] = (errorWordAgg[wordText].errorTypes[errType] || 0) + 1;
        }
      }
    }

    // --- Build topTasks ---
    const taskIds = Object.keys(taskAgg);

    // Fetch task titles in bulk
    const taskTitleMap = {};
    if (taskIds.length > 0) {
      // Fetch in batches since _.in has a limit
      const TASK_BATCH = 100;
      for (let i = 0; i < taskIds.length; i += TASK_BATCH) {
        const batch = taskIds.slice(i, i + TASK_BATCH);
        const taskRes = await db.collection('task_items')
          .where({ _id: _.in(batch) })
          .field({ _id: true, title: true })
          .get();
        for (const t of (taskRes.data || [])) {
          taskTitleMap[t._id] = t.title || '未命名任务';
        }
      }
    }

    const topTasks = taskIds.map((tid) => {
      const agg = taskAgg[tid];
      return {
        taskItemId: tid,
        title: taskTitleMap[tid] || '未命名任务',
        avgFinalScore: Math.round(agg.totalFinal / agg.count),
        avgPronScore: Math.round(agg.totalPron / agg.count),
        submissionCount: agg.count,
      };
    });
    // Sort by avgFinalScore ascending (lowest scores first)
    topTasks.sort((a, b) => a.avgFinalScore - b.avgFinalScore);
    const topTasksLimited = topTasks.slice(0, 20);

    // --- Build topErrorWords ---
    const topErrorWords = Object.keys(errorWordAgg).map((word) => {
      const agg = errorWordAgg[word];
      // Pick the most frequent error type
      let topErrorType = 'low_score';
      let topCount = 0;
      for (const [errType, count] of Object.entries(agg.errorTypes)) {
        if (count > topCount) {
          topCount = count;
          topErrorType = errType;
        }
      }
      return {
        word,
        errorCount: agg.count,
        errorType: topErrorType,
      };
    });
    // Sort by errorCount descending
    topErrorWords.sort((a, b) => b.errorCount - a.errorCount);
    const topErrorWordsLimited = topErrorWords.slice(0, 30);

    return {
      errCode: 0,
      topTasks: topTasksLimited,
      topErrorWords: topErrorWordsLimited,
    };
  } catch (error) {
    console.error('teacher_getTopErrors error:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
