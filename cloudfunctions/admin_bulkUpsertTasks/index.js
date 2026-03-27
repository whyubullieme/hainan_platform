const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeOne(item = {}, now) {
  const title = String(item.title || '').trim();
  const taskType = String(item.taskType || '').trim();
  if (!title) throw new Error('存在空标题任务');
  if (!taskType) throw new Error(`任务 ${title} 缺少 taskType`);

  const data = {
    title,
    content: String(item.content || '').trim(),
    taskType,
    isTemplate: true,
    status: String(item.status || 'draft'),
    updatedAt: now,
  };

  if (item.expectedAnswer !== undefined) data.expectedAnswer = item.expectedAnswer;
  if (item.ttsText !== undefined) data.ttsText = item.ttsText;
  if (item.options !== undefined) data.options = item.options;
  if (item.correctOptionKey !== undefined) data.correctOptionKey = item.correctOptionKey;
  if (item.sceneId !== undefined) data.sceneId = item.sceneId;
  if (item.sceneName !== undefined) data.sceneName = item.sceneName;
  if (item.sceneDesc !== undefined) data.sceneDesc = item.sceneDesc;
  if (item.level !== undefined && item.level !== null && item.level !== '') data.level = Number(item.level);
  if (item.order !== undefined && item.order !== null && item.order !== '') data.order = Number(item.order);
  if (item.versionTag !== undefined) data.versionTag = item.versionTag;
  if (item.scoringConfig !== undefined) data.scoringConfig = item.scoringConfig;
  if (item.acceptedAnswers !== undefined) data.acceptedAnswers = item.acceptedAnswers;
  if (item.keywords !== undefined) data.keywords = item.keywords;

  return data;
}

exports.main = async (event = {}) => {
  const { items = [], mode = 'upsert' } = event;
  if (!Array.isArray(items) || items.length === 0) {
    return { errCode: -1, errMsg: 'items 不能为空数组' };
  }
  if (items.length > 300) {
    return { errCode: -1, errMsg: '单次最多导入 300 条' };
  }

  try {
    const now = db.serverDate();
    let created = 0;
    let updated = 0;

    for (const raw of items) {
      // eslint-disable-next-line no-await-in-loop
      const data = normalizeOne(raw, now);
      if (mode === 'createOnly' || !raw.taskId) {
        data.createdAt = now;
        // eslint-disable-next-line no-await-in-loop
        await db.collection('task_items').add({ data });
        created += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await db.collection('task_items').doc(raw.taskId).update({ data });
        updated += 1;
      }
    }

    return {
      errCode: 0,
      errMsg: 'success',
      created,
      updated,
      total: created + updated,
    };
  } catch (error) {
    console.error('admin_bulkUpsertTasks error:', error);
    return { errCode: -1, errMsg: error.message || '批量导入失败' };
  }
};
