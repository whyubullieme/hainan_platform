// cloudfunctions/student_getDialogueSessions/index.js
// Return the current student's past dialogue sessions, sorted by createdAt desc.
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const BATCH_LIMIT = 100;

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { errCode: -1, errMsg: '无法获取用户身份' };

  try {
    // 1. Resolve user
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    // 2. Fetch dialogue sessions (paginated, most recent first)
    const all = [];
    let skip = 0;
    while (true) {
      const res = await db.collection('dialogue_sessions')
        .where({ userId })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(BATCH_LIMIT)
        .get();
      const data = res.data || [];
      all.push(...data);
      if (data.length < BATCH_LIMIT) break;
      skip += BATCH_LIMIT;
    }

    // 3. Shape response
    const sessions = all.map((s) => ({
      _id: s._id,
      sceneId: s.sceneId || '',
      sceneName: s.sceneName || '',
      level: s.level || '',
      totalScore: s.totalScore != null ? s.totalScore : null,
      passed: !!s.passed,
      evaluationStatus: s.evaluationStatus || '',
      finalScore: s.finalScore != null ? s.finalScore : null,
      semanticBreakdown: s.semanticBreakdown || null,
      createdAt: s.createdAt || null,
      turnCount: s.turns ? s.turns.length : (s.turnCount || 0)
    }));

    return { errCode: 0, errMsg: 'success', sessions };
  } catch (error) {
    console.error('student_getDialogueSessions error:', error);
    return { errCode: -1, errMsg: error.message || '获取对话记录失败' };
  }
};
