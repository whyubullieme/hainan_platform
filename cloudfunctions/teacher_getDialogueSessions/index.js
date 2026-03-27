// cloudfunctions/teacher_getDialogueSessions/index.js
// 教师查看指定学生的对话练习记录
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { classId, studentId } = event;
  if (!classId || !studentId) {
    return { errCode: -1, errMsg: '缺少 classId 或 studentId' };
  }

  try {
    // Verify caller is teacher/admin
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (openid) {
      const userRes = await db.collection('users').where({ openid }).limit(1).get();
      if (!userRes.data.length) return { errCode: -1, errMsg: '请先登录' };
      const user = userRes.data[0];
      if (user.role !== 'admin') {
        const memberRes = await db.collection('class_members')
          .where({ classId, userId: user._id, roleInClass: 'teacher', status: 'active' })
          .limit(1).get();
        if (!memberRes.data.length) return { errCode: -1, errMsg: '无权查看' };
      }
    }

    // Get dialogue sessions for this student
    const sessionsRes = await db.collection('dialogue_sessions')
      .where({ userId: studentId })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const sessions = (sessionsRes.data || []).map(s => ({
      _id: s._id,
      sceneId: s.sceneId,
      sceneName: s.sceneName || s.sceneId,
      level: s.level,
      totalScore: s.totalScore,
      finalScore: s.finalScore,
      evaluationStatus: s.evaluationStatus,
      semanticScore: s.semanticScore,
      semanticBreakdown: s.semanticBreakdown,
      semanticFeedback: s.semanticFeedback,
      passed: s.passed,
      turns: (s.turns || []).map(t => ({
        round: t.round,
        userText: t.userText,
        aiReply: t.aiReply,
        inputMode: t.inputMode,
      })),
      turnCount: (s.turns || []).length,
      createdAt: s.createdAt,
    }));

    return { errCode: 0, errMsg: 'success', sessions };
  } catch (e) {
    console.error('teacher_getDialogueSessions error:', e);
    return { errCode: -1, errMsg: e.message || '查询失败' };
  }
};
