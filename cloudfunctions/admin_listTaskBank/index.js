const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  try {
    const MAX_LIMIT = 100;

    // Fetch ALL task_items (both templates and class-specific)
    const countRes = await db.collection('task_items').count();
    const total = countRes.total;

    let tasks = [];
    const batchCount = Math.ceil(total / MAX_LIMIT);
    for (let i = 0; i < batchCount; i++) {
      const batch = await db.collection('task_items')
        .orderBy('taskType', 'asc')
        .orderBy('dayNumber', 'asc')
        .orderBy('order', 'asc')
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get();
      tasks = tasks.concat(batch.data);
    }

    return {
      errCode: 0,
      errMsg: 'success',
      tasks: tasks.map((t) => ({
        _id: t._id,
        title: t.title || '',
        content: t.content || '',
        taskType: t.taskType || '',
        level: t.level,
        order: t.order,
        dayNumber: t.dayNumber,
        classId: t.classId,
        isTemplate: !!t.isTemplate,
        sceneId: t.sceneId,
        sceneName: t.sceneName,
        sceneDesc: t.sceneDesc,
        targetExpressions: t.targetExpressions,
        options: t.options,
        correctOptionKey: t.correctOptionKey,
        ttsText: t.ttsText,
        expectedAnswer: t.expectedAnswer,
        status: t.status || 'draft',
        versionTag: t.versionTag || '',
        publishedAt: t.publishedAt,
        publishedBy: t.publishedBy,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };
  } catch (error) {
    console.error('admin_listTaskBank error:', error);
    return { errCode: -1, errMsg: error.message || '获取题库失败' };
  }
};
