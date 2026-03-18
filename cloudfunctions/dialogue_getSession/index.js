// cloudfunctions/dialogue_getSession/index.js
// Read session including evaluation results (used for frontend polling).
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { sessionId } = event;

  if (!openid) return { errCode: -1, errMsg: '无法获取用户身份' };
  if (!sessionId) return { errCode: -1, errMsg: '缺少 sessionId' };

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || !userRes.data.length) return { errCode: -1, errMsg: '请先登录' };
    const userId = userRes.data[0]._id;

    const sessionDoc = await db.collection('dialogue_sessions').doc(sessionId).get();
    if (!sessionDoc.data) return { errCode: -1, errMsg: '会话不存在' };
    if (sessionDoc.data.userId !== userId) return { errCode: -1, errMsg: '无权访问此会话' };

    const s = sessionDoc.data;
    return {
      errCode: 0,
      sessionId,
      evaluationStatus: s.evaluationStatus || null,
      finalScore: s.finalScore != null ? s.finalScore : null,
      semanticScore: s.semanticScore != null ? s.semanticScore : null,
      avgPronScore: s.avgPronScore != null ? s.avgPronScore : null,
      semanticBreakdown: s.semanticBreakdown || null,
      semanticFeedback: s.semanticFeedback || null,
      expressionsUsed: s.expressionsUsed || [],
      pronResults: s.pronResults || [],
    };
  } catch (error) {
    console.error('dialogue_getSession error:', error);
    return { errCode: -1, errMsg: error.message || '查询失败' };
  }
};
