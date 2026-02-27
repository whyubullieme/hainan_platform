// cloudfunctions/student_getTodayPlan/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 学生今日计划 + 今日状态
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
    const d = new Date();
    dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  try {
    // 1. 获取用户 ID
    const userRes = await db.collection('users').where({ openid }).get();
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

    // 3. 计算 dayNumber: (date - startDate) + 1，限制 1..5
    const start = new Date(startDate);
    const curr = new Date(dateStr);
    const diffDays = Math.floor((curr - start) / (24 * 60 * 60 * 1000));
    let dayNumber = diffDays + 1;
    if (dayNumber < 1) dayNumber = 1;
    if (dayNumber > 5) dayNumber = 5;

    // 4. 获取当日任务
    const taskRes = await db.collection('task_items')
      .where({ classId, dayNumber })
      .orderBy('order', 'asc')
      .get();

    const taskItems = (taskRes.data || []).map(t => ({
      taskItemId: t._id,
      title: t.title || '',
      content: t.content || '',
      order: t.order || 0
    }));

    // 5. 是否已打卡
    const checkinRes = await db.collection('checkins')
      .where({ classId, userId, dayNumber })
      .limit(1)
      .get();
    const checkedIn = checkinRes.data && checkinRes.data.length > 0;

    // 6. 已提交的任务 ID 列表
    const subRes = await db.collection('submissions')
      .where({ classId, userId, dayNumber })
      .get();
    const submittedTaskIds = (subRes.data || []).map(s => s.taskItemId).filter(Boolean);

    return {
      errCode: 0,
      errMsg: 'success',
      dayNumber,
      taskItems,
      status: { checkedIn, submittedTaskIds }
    };
  } catch (error) {
    console.error('student_getTodayPlan:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
