// cloudfunctions/student_getFullPlan/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

function parseYMDToUTC(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUTC(date, days) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + (days * DAY_MS));
}

function formatYMDFromUTC(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchAllDocs(collectionName, filter) {
  const all = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const res = await db.collection(collectionName)
      .where(filter)
      .skip(skip)
      .limit(BATCH_LIMIT)
      .get();
    const data = res.data || [];
    all.push(...data);
    if (data.length < BATCH_LIMIT) break;
    skip += BATCH_LIMIT;
  }
  return all;
}

/**
 * 学生：获取完整训练计划（全部任务）
 * 入参: { classId }
 * 出参: { startDate, totalDays, days: [{ dayNumber, dateStr, status, tasks, submittedTaskIds, checkedIn }] }
 * status: 'locked' | 'today' | 'expired'  locked=未来不可做 today=今日 expired=可补做
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const classId = event.classId;

  if (!openid || !classId) {
    return { errCode: -1, errMsg: '参数缺少 classId' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    const classRes = await db.collection('classes').doc(classId).get();
    if (!classRes.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }
    const cls = classRes.data;
    const startDate = cls.startDate || '';
    const start = parseYMDToUTC(startDate);
    if (!start) {
      return { errCode: -1, errMsg: '班级开始日期无效' };
    }

    // 校验学生是否属于该班级
    const memberRes = await db.collection('class_members')
      .where({ classId, userId, status: 'active' })
      .limit(1)
      .get();
    if (!memberRes.data || memberRes.data.length === 0) {
      return { errCode: -1, errMsg: '当前用户不属于该班级，无法查看计划' };
    }

    const now = new Date();
    const todayUTC = new Date(Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ));
    const todayStr = formatYMDFromUTC(todayUTC);

    const allTasks = await fetchAllDocs('task_items', { classId });

    const allSubs = await fetchAllDocs('submissions', { classId, userId });

    const subByDay = {};
    (allSubs || []).forEach((s) => {
      if (s.needsRedo) return;
      if (!s.dayNumber) return;
      if (!subByDay[s.dayNumber]) subByDay[s.dayNumber] = [];
      subByDay[s.dayNumber].push(s.taskItemId);
    });

    const allCheckins = await fetchAllDocs('checkins', { classId, userId });
    const checkedDays = new Set((allCheckins || []).map((c) => c.dayNumber));

    const tasksByDay = {};
    (allTasks || [])
      .sort((a, b) => (a.dayNumber - b.dayNumber) || ((a.order || 0) - (b.order || 0)))
      .forEach((t) => {
        const d = t.dayNumber;
        if (!d) return;
        if (!tasksByDay[d]) tasksByDay[d] = [];
        tasksByDay[d].push({
          taskItemId: t._id,
          title: t.title || '',
          content: t.content || '',
          taskType: t.taskType || 'read_aloud',
          order: t.order || 0
        });
      });

    const maxTaskDay = (allTasks || []).length === 0
      ? 0
      : Math.max(...allTasks.map((t) => t.dayNumber || 0));
    const totalDays = Math.max(maxTaskDay, cls.totalDays || 14);
    const days = [];
    for (let d = 1; d <= totalDays; d++) {
      const dateObj = addDaysUTC(start, d - 1);
      const dateStr = formatYMDFromUTC(dateObj);

      let status = 'locked';
      if (dateStr && dateStr < todayStr) status = 'expired';
      else if (dateStr && dateStr === todayStr) status = 'today';

      const tasks = (tasksByDay[d] || []).map((t) => ({
        ...t,
        submitted: (subByDay[d] || []).includes(t.taskItemId)
      }));

      days.push({
        dayNumber: d,
        dateStr,
        status,
        tasks,
        submittedTaskIds: subByDay[d] || [],
        checkedIn: checkedDays.has(d)
      });
    }

    return {
      errCode: 0,
      errMsg: 'success',
      startDate,
      totalDays,
      days
    };
  } catch (error) {
    console.error('student_getFullPlan:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
