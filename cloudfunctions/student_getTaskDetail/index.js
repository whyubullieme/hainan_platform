// cloudfunctions/student_getTaskDetail/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 学生：获取单个任务详情
 * 入参: { taskId }
 * 出参: { taskItem: { taskItemId, title, content, taskType, dayNumber, order } }
 * taskType: "read_along" | "read_aloud" 对应 跟读 | 朗读
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const taskId = event.taskId;

  if (!openid || !taskId) {
    return { errCode: -1, errMsg: '参数缺少 taskId' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    const taskDoc = await db.collection('task_items').doc(taskId).get();
    if (!taskDoc.data) {
      return { errCode: -1, errMsg: '任务不存在' };
    }
    const task = taskDoc.data;
    const classId = task.classId;

    const memberRes = await db.collection('class_members')
      .where({ classId, userId, status: 'active' })
      .limit(1)
      .get();
    if (!memberRes.data || memberRes.data.length === 0) {
      return { errCode: -1, errMsg: '无权限查看该任务' };
    }

    return {
      errCode: 0,
      errMsg: 'success',
      taskItem: {
        taskItemId: task._id,
        title: task.title || '',
        content: task.content || '',
        taskType: task.taskType || 'read_aloud',
        dayNumber: task.dayNumber || 1,
        order: task.order || 0
      }
    };
  } catch (error) {
    console.error('student_getTaskDetail:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
