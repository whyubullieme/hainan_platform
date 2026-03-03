// cloudfunctions/admin_createClassAndInitTasks/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

/**
 * 创建班级 + 初始化任务
 * 入参: { className, startDate, teacherUserIds?, tasks }
 * 出参: { classId, studentInviteCode, teacherInviteCode }
 */
function genInviteCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += s[Math.floor(Math.random() * s.length)];
  return code;
}

function ensureUniqueCode(existing) {
  let code = genInviteCode();
  while (existing.has(code)) {
    code = genInviteCode();
  }
  existing.add(code);
  return code;
}

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

async function fetchAllClasses() {
  const all = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const res = await db.collection('classes')
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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const user = userRes.data[0];
    if (user.role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可创建班级' };
    }

    const { className, startDate, totalDays: inputTotalDays, teacherUserIds = [], tasks = [] } = event;
    if (!className || !startDate) {
      return { errCode: -1, errMsg: '需要 className 和 startDate' };
    }

    const start = parseYMDToUTC(startDate);
    if (!start) {
      return { errCode: -1, errMsg: 'startDate 格式需为 YYYY-MM-DD' };
    }

    const totalDays = Math.max(1, Math.min(90, Number(inputTotalDays) || 14));

    const existingCodes = new Set();
    const allClasses = await fetchAllClasses();
    (allClasses || []).forEach((c) => {
      if (c.studentInviteCode) existingCodes.add(c.studentInviteCode);
      if (c.teacherInviteCode) existingCodes.add(c.teacherInviteCode);
      if (c.inviteCode) existingCodes.add(c.inviteCode);
    });

    const studentInviteCode = ensureUniqueCode(existingCodes);
    const teacherInviteCode = ensureUniqueCode(existingCodes);

    const endD = addDaysUTC(start, totalDays - 1);
    const endDate = formatYMDFromUTC(endD);

    const classRes = await db.collection('classes').add({
      data: {
        name: className,
        startDate,
        endDate,
        totalDays,
        studentInviteCode,
        teacherInviteCode,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    const classId = classRes._id;

    const INIT_DAYS = totalDays;
    const defaultDays = [
      { dayNumber: 1, items: [
        { title: '入住场景对话练习', content: '练习酒店入住英语对话', order: 1, taskType: 'read_along' },
        { title: '电话预订练习', content: '练习电话预订客房', order: 2, taskType: 'read_along' },
        { title: '退房场景对话', content: '练习退房流程对话', order: 3, taskType: 'read_aloud' }
      ]},
      { dayNumber: 2, items: [
        { title: '投诉处理对话', content: '处理客户投诉场景', order: 1, taskType: 'read_along' },
        { title: '海南旅游咨询', content: '介绍海南景点', order: 2, taskType: 'read_aloud' }
      ]},
      { dayNumber: 3, items: [{ title: '政策说明', content: '入住政策说明', order: 1, taskType: 'read_aloud' }]},
      { dayNumber: 4, items: [{ title: '综合练习1', content: '', order: 1, taskType: 'read_aloud' }]},
      { dayNumber: 5, items: [{ title: '综合练习2', content: '', order: 1, taskType: 'read_aloud' }]}
    ];
    for (let d = 6; d <= INIT_DAYS; d++) {
      defaultDays.push({ dayNumber: d, items: [{ title: `综合练习${d - 4}`, content: '', order: 1, taskType: 'read_aloud' }] });
    }

    const daysToUse = tasks && tasks.length > 0 ? tasks : defaultDays;

    for (const day of daysToUse) {
      const dayNumber = day.dayNumber || 1;
      const items = day.items || [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await db.collection('task_items').add({
          data: {
            classId,
            dayNumber,
            order: it.order !== undefined ? it.order : i + 1,
            title: it.title || '任务',
            content: it.content || '',
            taskType: it.taskType || 'read_aloud',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
      }
    }

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      studentInviteCode,
      teacherInviteCode
    };
  } catch (error) {
    console.error('admin_createClassAndInitTasks:', error);
    return { errCode: -1, errMsg: error.message || '创建失败' };
  }
};
