// cloudfunctions/teacher_getTaskBank/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 教师：获取任务库（供“添加一天任务”时勾选）
 * 入参: 无（或 classId 仅做权限校验）
 * 出参: { tasks: [{ id, title, content, taskType, order }] }
 */
function getTaskBank() {
  const list = [
    { id: '1', title: '入住场景对话练习', content: '练习酒店入住英语对话', taskType: 'read_along', order: 1 },
    { id: '2', title: '电话预订练习', content: '练习电话预订客房', taskType: 'read_along', order: 2 },
    { id: '3', title: '退房场景对话', content: '练习退房流程对话', taskType: 'read_aloud', order: 3 },
    { id: '4', title: '投诉处理对话', content: '处理客户投诉场景', taskType: 'read_along', order: 4 },
    { id: '5', title: '海南旅游咨询', content: '介绍海南景点', taskType: 'read_aloud', order: 5 },
    { id: '6', title: '政策说明', content: '入住政策说明', taskType: 'read_aloud', order: 6 },
    { id: '7', title: '综合练习1', content: '', taskType: 'read_aloud', order: 7 },
    { id: '8', title: '综合练习2', content: '', taskType: 'read_aloud', order: 8 },
  ];
  for (let i = 9; i <= 50; i++) {
    list.push({
      id: String(i),
      title: `综合练习${i - 6}`,
      content: '',
      taskType: 'read_aloud',
      order: i,
    });
  }
  return list;
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

    const tasks = getTaskBank();
    return { errCode: 0, errMsg: 'success', tasks };
  } catch (error) {
    console.error('teacher_getTaskBank:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
