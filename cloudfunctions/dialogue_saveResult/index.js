// cloudfunctions/dialogue_saveResult/index.js
// Persist dialogue session results from the gateway.
// Called by the mini program after the session ends.
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PASS_LINE = 60;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { sessionId, turns, totalScore, passed, summary } = event;

  if (!openid)    return { errCode: -1, errMsg: '无法获取用户身份' };
  if (!sessionId) return { errCode: -1, errMsg: '缺少 sessionId' };

  try {
    // 1. Auth
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || !userRes.data.length) return { errCode: -1, errMsg: '请先登录' };
    const userId = userRes.data[0]._id;

    // 2. Load session & verify ownership
    const sessionDoc = await db.collection('dialogue_sessions').doc(sessionId).get();
    if (!sessionDoc.data) return { errCode: -1, errMsg: '会话不存在' };
    if (sessionDoc.data.userId !== userId) return { errCode: -1, errMsg: '无权操作此会话' };

    // 3. Build update — preserve new per-turn fields
    const safeTurns = (turns || []).map((t, i) => ({
      round: t.round || i + 1,
      userText: String(t.userText || '').slice(0, 500),
      aiReply: String(t.aiReply || '').slice(0, 500),
      aiFeedback: String(t.aiFeedback || '').slice(0, 300),
      coachScore: Math.min(100, Math.max(0, Number(t.coachScore) || 0)),
      inputMode: t.inputMode === 'voice' ? 'voice' : 'text',
      audioFileId: t.audioFileId ? String(t.audioFileId) : null,
      asrText: t.asrText ? String(t.asrText).slice(0, 500) : null,
      timestamp: db.serverDate()
    }));

    const finalScore = Math.min(100, Math.max(0, Number(totalScore) || 0));
    const finalPassed = finalScore >= PASS_LINE;

    await db.collection('dialogue_sessions').doc(sessionId).update({
      data: {
        turns: safeTurns,
        currentRound: safeTurns.length,
        isSessionEnd: true,
        totalScore: finalScore,
        passed: finalPassed,
        summary: String(summary || '').slice(0, 500),
        // Async evaluation fields
        evaluationStatus: 'pending',
        evaluationCursor: 0,
        evaluationVersion: 0,
        updatedAt: db.serverDate()
      }
    });

    // 4. Fire-and-forget: trigger async evaluation
    cloud.callFunction({
      name: 'dialogue_evaluateSession',
      data: { sessionId },
    }).catch((e) => {
      console.warn('trigger evaluateSession failed (fire-and-forget):', e.message);
    });

    return { errCode: 0, errMsg: 'saved' };
  } catch (error) {
    console.error('dialogue_saveResult error:', error);
    return { errCode: -1, errMsg: error.message || '保存失败' };
  }
};
