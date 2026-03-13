const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function normalizeKey(v) {
  return String(v || '').trim().slice(0, 1).toUpperCase();
}

function normalizeOptions(options = []) {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt, idx) => {
      if (!opt) return null;
      if (typeof opt === 'string') {
        return { key: String.fromCharCode(65 + idx), text: opt.trim() };
      }
      const key = normalizeKey(opt.key || String.fromCharCode(65 + idx));
      const text = String(opt.text || '').trim();
      if (!key || !text) return null;
      return { key, text };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function pickOptionText(options, key) {
  const found = (options || []).find((o) => o.key === key);
  return found ? found.text : '';
}

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const anchorTaskId = String(event.anchorTaskId || '').trim();
  const answersRaw = Array.isArray(event.answers) ? event.answers : [];

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }
  if (!anchorTaskId) {
    return { errCode: -1, errMsg: '缺少 anchorTaskId' };
  }
  if (answersRaw.length === 0) {
    return { errCode: -1, errMsg: '请先作答后提交' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    const anchorRes = await db.collection('task_items').doc(anchorTaskId).get();
    if (!anchorRes.data) {
      return { errCode: -1, errMsg: '任务不存在' };
    }
    const anchorTask = anchorRes.data;
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
      return { errCode: -1, errMsg: '无权限提交该任务' };
    }

    const dayTasksRes = await db.collection('task_items')
      .where({ classId, dayNumber, taskType: 'listening_mcq' })
      .orderBy('order', 'asc')
      .get();

    const dayTasks = dayTasksRes.data || [];
    if (dayTasks.length === 0) {
      return { errCode: -1, errMsg: '当天没有听力题' };
    }

    const dayTaskMap = new Map();
    dayTasks.forEach((t) => dayTaskMap.set(String(t._id), t));

    const answersMap = new Map();
    answersRaw.forEach((a) => {
      const taskItemId = String((a && a.taskItemId) || '').trim();
      const selectedOptionKey = normalizeKey(a && a.selectedOptionKey);
      if (!taskItemId || !selectedOptionKey) return;
      answersMap.set(taskItemId, selectedOptionKey);
    });

    const missing = dayTasks.filter((t) => !answersMap.has(String(t._id)));
    if (missing.length > 0) {
      return { errCode: -1, errMsg: `还有 ${missing.length} 题未作答` };
    }

    const now = db.serverDate();
    const items = [];
    let correctCount = 0;

    for (let i = 0; i < dayTasks.length; i += 1) {
      const t = dayTasks[i];
      const taskItemId = String(t._id);
      const selectedOptionKey = answersMap.get(taskItemId) || '';
      const correctOptionKey = normalizeKey(t.correctOptionKey);
      const options = normalizeOptions(t.options || []);
      const selectedOptionText = pickOptionText(options, selectedOptionKey);
      const correctOptionText = pickOptionText(options, correctOptionKey);
      const isCorrect = !!correctOptionKey && selectedOptionKey === correctOptionKey;
      if (isCorrect) correctCount += 1;

      const note = `${selectedOptionKey}. ${selectedOptionText || '未识别选项'}`;
      const existRes = await db.collection('submissions')
        .where({ classId, userId, dayNumber, taskItemId })
        .limit(1)
        .get();

      const saveData = {
        note,
        audioFileId: '',
        audioFileName: '',
        status: 'recorded',
        needsRedo: false,
        redoComment: '',
        redoAt: null,
        redoByTeacherId: '',
        evaluationStatus: 'completed',
        evaluationError: null,
        asrText: '',
        semanticScore: null,
        pronScore: null,
        finalScore: null,
        semanticPassed: null,
        pronDetails: null,
        listeningSelectedOptionKey: selectedOptionKey,
        listeningCorrectOptionKey: correctOptionKey,
        listeningIsCorrect: isCorrect,
        listeningAnsweredAt: now,
        updatedAt: now,
      };

      if (existRes.data && existRes.data.length > 0) {
        await db.collection('submissions').doc(existRes.data[0]._id).update({ data: saveData });
      } else {
        await db.collection('submissions').add({
          data: {
            classId,
            userId,
            dayNumber,
            taskItemId,
            channel: 'wechat_group',
            createdAt: now,
            ...saveData,
          }
        });
      }

      items.push({
        questionNo: i + 1,
        taskItemId,
        title: '听力训练',
        selectedOptionKey,
        selectedOptionText,
        correctOptionKey,
        correctOptionText,
        isCorrect,
      });
    }

    const total = dayTasks.length;
    const score = Math.round((correctCount / total) * 100);

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      dayNumber,
      total,
      correctCount,
      score,
      items,
    };
  } catch (error) {
    console.error('student_submitListeningSession:', error);
    return { errCode: -1, errMsg: error.message || '提交失败' };
  }
};
