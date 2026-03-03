// cloudfunctions/teacher_addDayTasks/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 教师：为班级添加一天任务（从任务库取模板，综合练习x）
 * 入参: { classId }
 * 出参: { dayNumber, ok: true }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const classId = event.classId;

  if (!openid || !classId) {
    return { errCode: -1, errMsg: '参数缺少 classId' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).get();
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

    const taskRes = await db.collection('task_items').where({ classId }).get();
    const items = taskRes.data || [];
    const maxDay = items.length === 0 ? 0 : Math.max(...items.map(t => t.dayNumber || 0));
    const nextDay = maxDay + 1;

    const title = nextDay <= 5
      ? ['入住场景对话练习', '投诉处理对话', '政策说明', '综合练习1', '综合练习2'][nextDay - 1]
      : `综合练习${nextDay - 4}`;

    await db.collection('task_items').add({
      data: {
        classId,
        dayNumber: nextDay,
        order: 1,
        title,
        content: '',
        taskType: 'read_aloud',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    return { errCode: 0, errMsg: 'success', dayNumber: nextDay, ok: true };
  } catch (error) {
    console.error('teacher_addDayTasks:', error);
    return { errCode: -1, errMsg: error.message || '添加失败' };
  }
};
