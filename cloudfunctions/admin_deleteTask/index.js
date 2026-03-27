const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { taskId } = event || {};

  if (!taskId) {
    return { errCode: -1, errMsg: '缺少 taskId' };
  }

  try {
    await db.collection('task_items').doc(taskId).remove();
    return { errCode: 0, errMsg: 'success' };
  } catch (error) {
    console.error('admin_deleteTask error:', error);
    return { errCode: -1, errMsg: error.message || '删除任务失败' };
  }
};
