const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function ensureAdminOrTeacher(classId, openid) {
  if (!classId) {
    throw new Error('缺少 classId');
  }

  // 支持在云函数控制台直接调用（无 openid 视为 admin）
  if (!openid) {
    return { userId: null, role: 'admin' };
  }

  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  if (!userRes.data || userRes.data.length === 0) {
    throw new Error('请先登录');
  }
  const user = userRes.data[0];

  if (user.role === 'admin') {
    return { userId: user._id, role: 'admin' };
  }

  const teacherMemberRes = await db.collection('class_members')
    .where({ classId, userId: user._id, roleInClass: 'teacher', status: 'active' })
    .limit(1)
    .get();
  if (!teacherMemberRes.data || teacherMemberRes.data.length === 0) {
    throw new Error('仅管理员或班级教师可插入对话任务');
  }
  return { userId: user._id, role: 'teacher' };
}

function buildDialogueTasks() {
  return [
    {
      title: '前台入住对话',
      content: '情景：客人到达酒店前台，你作为前台员工办理入住（Level 1 · 3轮）',
      taskType: 'dialogue',
      sceneId: 'scene_checkin',
      level: 1,
      scoringConfig: {
        semanticWeight: 0.6,
        pronWeight: 0.4,
        semanticPassLine: 60,
        pronPassLine: 60
      }
    },
    {
      title: '投诉处理对话',
      content: '情景：客人投诉房间噪音或设备问题，你作为前台安抚并给出解决方案（Level 2 · 4轮）',
      taskType: 'dialogue',
      sceneId: 'scene_complaint',
      level: 2,
      scoringConfig: { semanticWeight: 0.6, pronWeight: 0.4, semanticPassLine: 60, pronPassLine: 60 }
    },
    {
      title: '客房服务对话',
      content: '情景：客人拨打客房服务电话点餐或要求额外用品（Level 1 · 3轮）',
      taskType: 'dialogue',
      sceneId: 'scene_service',
      level: 1,
      scoringConfig: { semanticWeight: 0.6, pronWeight: 0.4, semanticPassLine: 60, pronPassLine: 60 }
    },
    {
      title: '退房结账对话',
      content: '情景：客人来前台退房结账（Level 2 · 4轮）',
      taskType: 'dialogue',
      sceneId: 'scene_checkout',
      level: 2,
      scoringConfig: { semanticWeight: 0.6, pronWeight: 0.4, semanticPassLine: 60, pronPassLine: 60 }
    },
    {
      title: '问路指引对话',
      content: '情景：客人询问附近景点或餐厅的路线（Level 1 · 3轮）',
      taskType: 'dialogue',
      sceneId: 'scene_directions',
      level: 1,
      scoringConfig: { semanticWeight: 0.6, pronWeight: 0.4, semanticPassLine: 60, pronPassLine: 60 }
    },
    {
      title: '餐厅预约对话',
      content: '情景：客人想预约酒店餐厅（Level 2 · 4轮）',
      taskType: 'dialogue',
      sceneId: 'scene_reservation',
      level: 2,
      scoringConfig: { semanticWeight: 0.6, pronWeight: 0.4, semanticPassLine: 60, pronPassLine: 60 }
    },
    {
      title: '叫醒服务对话',
      content: '情景：客人打电话要求叫醒服务并询问早餐时间（Level 1 · 3轮）',
      taskType: 'dialogue',
      sceneId: 'scene_wake_up',
      level: 1,
      scoringConfig: { semanticWeight: 0.6, pronWeight: 0.4, semanticPassLine: 60, pronPassLine: 60 }
    },
    {
      title: '失物招领对话',
      content: '情景：客人在酒店丢了东西，寻求前台帮助（Level 3 · 5轮）',
      taskType: 'dialogue',
      sceneId: 'scene_lost_item',
      level: 3,
      scoringConfig: { semanticWeight: 0.6, pronWeight: 0.4, semanticPassLine: 60, pronPassLine: 60 }
    }
  ];
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, dayNumber } = event || {};

  if (!classId) {
    return { errCode: -1, errMsg: '缺少 classId' };
  }
  if (!dayNumber) {
    return { errCode: -1, errMsg: '缺少 dayNumber（建议从 1 开始）' };
  }

  const parsedDay = Number.parseInt(dayNumber, 10);
  if (Number.isNaN(parsedDay) || parsedDay < 1) {
    return { errCode: -1, errMsg: 'dayNumber 无效，应为正整数' };
  }

  try {
    await ensureAdminOrTeacher(classId, openid);

    const classRes = await db.collection('classes').doc(classId).get();
    if (!classRes.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    const existingRes = await db.collection('task_items')
      .where({ classId, dayNumber: parsedDay })
      .get();
    const existing = existingRes.data || [];
    const baseOrder = existing.length === 0
      ? 1
      : (Math.max(...existing.map((t) => Number(t.order) || 0)) + 1);

    const dialogueTasks = buildDialogueTasks();
    const now = db.serverDate();

    for (let i = 0; i < dialogueTasks.length; i += 1) {
      const t = dialogueTasks[i];
      await db.collection('task_items').add({
        data: {
          classId,
          dayNumber: parsedDay,
          order: baseOrder + i,
          title: t.title,
          content: t.content,
          taskType: 'dialogue',
          sceneId: t.sceneId,
          level: t.level,
          scoringConfig: t.scoringConfig,
          createdAt: now,
          updatedAt: now
        }
      });
    }

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      dayNumber: parsedDay,
      insertedCount: dialogueTasks.length
    };
  } catch (error) {
    console.error('admin_seedDialogueTasks error:', error);
    return { errCode: -1, errMsg: error.message || '插入对话任务失败' };
  }
};
