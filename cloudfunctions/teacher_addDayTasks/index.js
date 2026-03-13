// cloudfunctions/teacher_addDayTasks/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDate(input) {
  if (!input) return null;
  const d = new Date(String(input));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveDayNumber(startDateStr, inputDayNumber, inputDate) {
  const parsedDay = Number.parseInt(inputDayNumber, 10);
  if (!Number.isNaN(parsedDay) && parsedDay >= 1) {
    return parsedDay;
  }
  const startDate = normalizeDate(startDateStr);
  const targetDate = normalizeDate(inputDate);
  if (!startDate || !targetDate) {
    return null;
  }
  const diffDays = Math.floor((targetDate.getTime() - startDate.getTime()) / DAY_MS);
  const dayNumber = diffDays + 1;
  return dayNumber >= 1 ? dayNumber : null;
}

/**
 * 教师：为班级添加一天任务
 * 入参: { classId, dayNumber?, date?, tasks? }
 *  tasks 为选中的任务列表
 *  [{ title, content?, taskType?, order?, expectedAnswer?, acceptedAnswers?, keywords?, scoringConfig?,
 *    options?, correctOptionKey?, ttsText?, promptAudioUrl? }]
 * 出参: { dayNumber, ok: true }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, dayNumber, date, tasks: inputTasks } = event;

  if (!openid || !classId) {
    return { errCode: -1, errMsg: '参数缺少 classId' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    const memberRes = await db.collection('class_members')
      .where({ classId, userId, roleInClass: 'teacher', status: 'active' })
      .limit(1)
      .get();

    if (!memberRes.data || memberRes.data.length === 0) {
      const user = userRes.data[0];
      if (user.role !== 'admin') {
        return { errCode: -1, errMsg: '仅班级教师可操作' };
      }
    }

    const classRes = await db.collection('classes').doc(classId).get();
    if (!classRes.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    if (date && !normalizeDate(date)) {
      return { errCode: -1, errMsg: 'date 格式无效，应为 YYYY-MM-DD' };
    }

    const taskRes = await db.collection('task_items').where({ classId }).get();
    const items = taskRes.data || [];
    const maxDay = items.length === 0 ? 0 : Math.max(...items.map((t) => t.dayNumber || 0));
    const resolvedDay = resolveDayNumber(classRes.data.startDate, dayNumber, date) || (maxDay + 1);

    const dayItems = items.filter((t) => Number(t.dayNumber) === Number(resolvedDay));
    const nextOrder = dayItems.length === 0
      ? 1
      : (Math.max(...dayItems.map((t) => Number(t.order) || 0)) + 1);

    const tasks = Array.isArray(inputTasks) ? inputTasks : [];
    if (tasks.length === 0) {
      return { errCode: -1, errMsg: '请至少选择一项任务' };
    }

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const taskData = {
        classId,
        dayNumber: resolvedDay,
        order: t.order !== undefined ? t.order : (nextOrder + i),
        title: t.title || '任务',
        content: t.content || '',
        taskType: t.taskType || 'read_along',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      };
      if (t.expectedAnswer != null) taskData.expectedAnswer = String(t.expectedAnswer).trim() || undefined;
      if (Array.isArray(t.acceptedAnswers) && t.acceptedAnswers.length > 0) {
        taskData.acceptedAnswers = t.acceptedAnswers.map((a) => String(a).trim()).filter(Boolean);
      }
      if (Array.isArray(t.keywords) && t.keywords.length > 0) {
        taskData.keywords = t.keywords.map((k) => String(k).trim()).filter(Boolean);
      }
      if (t.scoringConfig && typeof t.scoringConfig === 'object') {
        taskData.scoringConfig = {
          semanticWeight: Number(t.scoringConfig.semanticWeight) || 0.5,
          pronWeight: Number(t.scoringConfig.pronWeight) || 0.5,
          semanticPassLine: Number(t.scoringConfig.semanticPassLine),
          pronPassLine: Number(t.scoringConfig.pronPassLine),
        };
      }
      if (Array.isArray(t.options) && t.options.length > 0) {
        taskData.options = t.options
          .map((opt, idx) => {
            if (!opt) return null;
            if (typeof opt === 'string') {
              const key = String.fromCharCode(65 + idx);
              return { key, text: opt.trim() };
            }
            const key = String(opt.key || String.fromCharCode(65 + idx)).trim().slice(0, 1).toUpperCase();
            const text = String(opt.text || '').trim();
            if (!key || !text) return null;
            return { key, text };
          })
          .filter(Boolean)
          .slice(0, 4);
      }
      if (t.correctOptionKey != null) {
        taskData.correctOptionKey = String(t.correctOptionKey).trim().slice(0, 1).toUpperCase();
      }
      if (t.ttsText != null) {
        taskData.ttsText = String(t.ttsText).trim();
      }
      if (t.promptAudioUrl != null) {
        taskData.promptAudioUrl = String(t.promptAudioUrl).trim();
      }
      await db.collection('task_items').add({ data: taskData });
    }

    return { errCode: 0, errMsg: 'success', dayNumber: resolvedDay, ok: true };
  } catch (error) {
    console.error('teacher_addDayTasks:', error);
    return { errCode: -1, errMsg: error.message || '添加失败' };
  }
};
