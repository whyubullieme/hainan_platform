// cloudfunctions/dialogue_startSession/index.js
// Creates a dialogue session record in the DB.
// Real-time AI dialogue is handled by the gateway server.
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ─── Scene definitions ────────────────────────────────────────────────────────
const SCENES = {
  scene_checkin: {
    nameZh: '前台入住',
    name: 'Hotel Check-in',
    desc: 'A guest arrives at the hotel front desk to check in for the first time.',
  },
  scene_complaint: {
    nameZh: '投诉处理',
    name: 'Handling a Complaint',
    desc: 'A guest calls the front desk with a complaint about noise or a broken item in their room.',
  },
  scene_service: {
    nameZh: '客房服务',
    name: 'Room Service',
    desc: 'A guest calls room service to order food or request extra amenities.',
  }
};

function getMaxRounds(level) {
  return { 1: 3, 2: 4 }[Number(level)] || 5;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { taskItemId } = event;

  if (!openid)     return { errCode: -1, errMsg: '无法获取用户身份' };
  if (!taskItemId) return { errCode: -1, errMsg: '缺少 taskItemId' };

  try {
    // 1. Auth
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || !userRes.data.length) return { errCode: -1, errMsg: '请先登录' };
    const userId = userRes.data[0]._id;

    // 2. Load task
    const taskDoc = await db.collection('task_items').doc(taskItemId).get();
    if (!taskDoc.data) return { errCode: -1, errMsg: '任务不存在' };
    const task = taskDoc.data;
    if (task.taskType !== 'dialogue') return { errCode: -1, errMsg: '该任务不是对话类型' };

    // 3. Verify class membership
    const memberRes = await db.collection('class_members')
      .where({ classId: task.classId, userId, status: 'active' })
      .limit(1).get();
    if (!memberRes.data || !memberRes.data.length) return { errCode: -1, errMsg: '无权限访问该任务' };

    // 4. Scene & level
    const sceneId   = task.sceneId || 'scene_checkin';
    const level     = Number(task.level) || 1;
    const scene     = SCENES[sceneId] || SCENES.scene_checkin;
    const maxRounds = getMaxRounds(level);

    // 5. Persist session
    const addRes = await db.collection('dialogue_sessions').add({
      data: {
        classId: task.classId,
        userId,
        taskItemId,
        sceneId,
        level,
        maxRounds,
        currentRound: 0,
        isSessionEnd: false,
        turns: [],
        totalScore: null,
        passed: null,
        summary: null,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    return {
      errCode: 0,
      errMsg: 'success',
      sessionId: addRes._id,
      sceneId,
      sceneName: scene.nameZh,
      sceneDesc: scene.desc,
      level,
      maxRounds
    };
  } catch (error) {
    console.error('dialogue_startSession error:', error);
    return { errCode: -1, errMsg: error.message || '开始对话失败' };
  }
};
