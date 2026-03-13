// cloudfunctions/student_getTodayPlan/index.js
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
 * 学生题库列表 + 今日状态指示
 * 入参: { classId, date? }  date 默认今天 YYYY-MM-DD
 * 出参: { dayNumber, taskItems, status: { checkedIn, submittedTaskIds } }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const classId = event.classId;
  let dateStr = event.date;

  if (!openid || !classId) {
    return { errCode: -1, errMsg: '参数缺少 classId' };
  }

  if (!dateStr) {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ));
    dateStr = formatYMDFromUTC(todayUTC);
  }

  try {
    // 1. 获取用户 ID
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    // 2. 获取班级
    const classRes = await db.collection('classes').doc(classId).get();
    if (!classRes.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }
    const cls = classRes.data;
    const startDate = cls.startDate || '';

    // 3. 校验学生是否属于该班级
    const memberRes = await db.collection('class_members')
      .where({ classId, userId, status: 'active' })
      .limit(1)
      .get();
    if (!memberRes.data || memberRes.data.length === 0) {
      return { errCode: -1, errMsg: '当前用户不属于该班级，无法查看任务' };
    }

    // 4. 计算 dayNumber: (date - startDate) + 1，使用 UTC 避免时区偏移
    const start = parseYMDToUTC(startDate);
    const curr = parseYMDToUTC(dateStr);
    if (!start || !curr) {
      return { errCode: -1, errMsg: '班级开始日期或查询日期无效' };
    }
    const diffDays = Math.floor((curr.getTime() - start.getTime()) / DAY_MS);
    let dayNumber = diffDays + 1;
    if (dayNumber < 1) dayNumber = 1;

    // 5. 获取全题库任务（不再按天数限制）
    const allTasks = await fetchAllDocs('task_items', { classId });
    const taskItems = (allTasks || [])
      .sort((a, b) => {
        const dayDiff = (a.dayNumber || 0) - (b.dayNumber || 0);
        if (dayDiff !== 0) return dayDiff;
        return (a.order || 0) - (b.order || 0);
      })
      .map((t) => ({
        taskItemId: t._id,
        title: t.title || '',
        content: t.content || '',
        taskType: t.taskType || 'read_along',
        dayNumber: Number(t.dayNumber) || 1,
        order: t.order || 0,
      }));

    // 6. 是否已打卡
    const checkinRes = await db.collection('checkins')
      .where({ classId, userId, dayNumber })
      .limit(1)
      .get();
    const checkedIn = checkinRes.data && checkinRes.data.length > 0;

    // 7. 已提交的任务 ID 列表（全题库）
    const allSubs = await fetchAllDocs('submissions', { classId, userId });
    const submittedTaskIds = (allSubs || [])
      .filter((s) => !s.needsRedo)
      .map((s) => s.taskItemId)
      .filter(Boolean);

    return {
      errCode: 0,
      errMsg: 'success',
      dayNumber,
      taskItems,
      status: { checkedIn, submittedTaskIds },
      className: cls.name || '',
    };
  } catch (error) {
    console.error('student_getTodayPlan:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
