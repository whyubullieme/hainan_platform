// cloudfunctions/student_getMySubmissions/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

async function fetchAllSubmissions({ classId, userId }) {
  const all = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const res = await db.collection('submissions')
      .where({ classId, userId })
      .orderBy('createdAt', 'desc')
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
 * 学生：获取我的提交记录
 * 入参: { classId, date? }  date 可选，YYYY-MM-DD，不传则返回全部
 * 出参: { startDate, records: [{ dayNumber, dateStr, taskItemId, taskTitle, submittedAt }] }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, date: dateStr } = event;

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
    const startDate = classRes.data.startDate || '';
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
      return { errCode: -1, errMsg: '当前用户不属于该班级，无法查看提交记录' };
    }

    let subs = await fetchAllSubmissions({ classId, userId });

    if (dateStr) {
      const target = parseYMDToUTC(dateStr);
      if (!target) {
        return { errCode: -1, errMsg: '日期格式无效，需为 YYYY-MM-DD' };
      }
      const diffDays = Math.floor((target.getTime() - start.getTime()) / DAY_MS);
      const dayNumber = diffDays + 1;
      if (dayNumber < 1) {
        return { errCode: 0, errMsg: 'success', startDate, records: [] };
      }
      subs = subs.filter((s) => s.dayNumber === dayNumber);
    }

    const taskIds = [...new Set(subs.map((s) => s.taskItemId).filter(Boolean))];
    const taskMap = {};
    if (taskIds.length > 0) {
      const taskRes = await db.collection('task_items')
        .where({ _id: _.in(taskIds) })
        .get();
      (taskRes.data || []).forEach((t) => { taskMap[t._id] = t; });
    }

    const records = subs.map((s) => {
      const dateObj = addDaysUTC(start, (s.dayNumber || 1) - 1);
      const dateStrOut = formatYMDFromUTC(dateObj);
      return {
        dayNumber: s.dayNumber,
        dateStr: dateStrOut,
        taskItemId: s.taskItemId,
        taskTitle: (taskMap[s.taskItemId] && taskMap[s.taskItemId].title) || '任务',
        submittedAt: s.createdAt
      };
    });

    return { errCode: 0, errMsg: 'success', startDate, records };
  } catch (error) {
    console.error('student_getMySubmissions:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
