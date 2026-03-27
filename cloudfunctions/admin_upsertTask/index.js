const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const {
    taskId,
    title,
    content,
    taskType,
    level,
    order,
    sceneId,
    sceneName,
    sceneDesc,
    targetExpressions,
    options,
    correctOptionKey,
    ttsText,
    expectedAnswer,
    status,
    versionTag,
  } = event || {};

  if (!title || !title.trim()) {
    return { errCode: -1, errMsg: '任务标题不能为空' };
  }
  if (!taskType) {
    return { errCode: -1, errMsg: '请选择任务类型' };
  }

  const now = db.serverDate();

  const taskData = {
    title: title.trim(),
    content: (content || '').trim(),
    taskType,
    isTemplate: true,
    updatedAt: now,
  };

  if (status !== undefined) {
    taskData.status = status;
  }
  if (versionTag !== undefined) {
    taskData.versionTag = versionTag;
  }

  // Optional fields — only set if provided
  if (level !== undefined && level !== null && level !== '') {
    taskData.level = Number(level);
  }
  if (order !== undefined && order !== null && order !== '') {
    taskData.order = Number(order);
  }
  if (sceneId !== undefined) taskData.sceneId = sceneId;
  if (sceneName !== undefined) taskData.sceneName = sceneName;
  if (sceneDesc !== undefined) taskData.sceneDesc = sceneDesc;
  if (targetExpressions !== undefined) taskData.targetExpressions = targetExpressions;
  if (options !== undefined) taskData.options = options;
  if (correctOptionKey !== undefined) taskData.correctOptionKey = correctOptionKey;
  if (ttsText !== undefined) taskData.ttsText = ttsText;
  if (expectedAnswer !== undefined) taskData.expectedAnswer = expectedAnswer;

  try {
    if (taskId) {
      // Update existing task
      await db.collection('task_items').doc(taskId).update({
        data: taskData,
      });
      return { errCode: 0, errMsg: 'success', taskId };
    }

    // Create new task
    taskData.createdAt = now;
    if (!taskData.status) {
      taskData.status = 'draft';
    }
    const addRes = await db.collection('task_items').add({
      data: taskData,
    });
    return { errCode: 0, errMsg: 'success', taskId: addRes._id };
  } catch (error) {
    console.error('admin_upsertTask error:', error);
    return { errCode: -1, errMsg: error.message || '保存任务失败' };
  }
};
