const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeOptions(options = []) {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt, idx) => {
      if (!opt) return null;
      if (typeof opt === 'string') {
        return { key: String.fromCharCode(65 + idx), text: opt.trim() };
      }
      const key = String(opt.key || String.fromCharCode(65 + idx)).trim().slice(0, 1).toUpperCase();
      const text = String(opt.text || '').trim();
      if (!key || !text) return null;
      return { key, text };
    })
    .filter(Boolean)
    .slice(0, 4);
}

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const taskId = (event.taskId || '').trim();

  if (!openid || !taskId) {
    return { errCode: -1, errMsg: '参数缺少 taskId' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    const anchorTaskRes = await db.collection('task_items').doc(taskId).get();
    if (!anchorTaskRes.data) {
      return { errCode: -1, errMsg: '任务不存在' };
    }
    const anchorTask = anchorTaskRes.data;

    if ((anchorTask.taskType || '') !== 'listening_mcq') {
      return { errCode: -1, errMsg: '该任务不是听力题' };
    }

    const classId = anchorTask.classId;
    const dayNumber = Number(anchorTask.dayNumber) || 1;

    const memberRes = await db.collection('class_members')
      .where({ classId, userId, status: 'active' })
      .limit(1)
      .get();
    if (!memberRes.data || memberRes.data.length === 0) {
      return { errCode: -1, errMsg: '无权限查看该任务' };
    }

    const taskRes = await db.collection('task_items')
      .where({ classId, dayNumber, taskType: 'listening_mcq' })
      .orderBy('order', 'asc')
      .get();

    const questions = (taskRes.data || []).map((t, idx) => ({
      taskItemId: t._id,
      title: '听力训练',
      order: Number(t.order) || (idx + 1),
      promptAudioUrl: t.promptAudioUrl || '',
      ttsText: t.ttsText || '',
      options: normalizeOptions(t.options || []),
    }));

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      dayNumber,
      total: questions.length,
      title: '听力训练',
      questions,
    };
  } catch (error) {
    console.error('student_getListeningSession:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
