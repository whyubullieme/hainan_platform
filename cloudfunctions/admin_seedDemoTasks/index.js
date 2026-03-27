// cloudfunctions/admin_seedDemoTasks/index.js
// 一键为指定班级插入 demo 任务（含 expectedAnswer / acceptedAnswers / keywords / scoringConfig）
const cloud = require('wx-server-sdk');
const importedTasks = require('./readaloud_tasks.generated.json');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function ensureAdminOrTeacher(classId, openid) {
  if (!classId) {
    throw new Error('缺少 classId');
  }

  // 开发阶段：支持在云函数控制台直接调用（无 openid 时默认视为 admin）
  if (!openid) {
    return { userId: null, role: 'admin' };
  }

  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  if (!userRes.data || userRes.data.length === 0) {
    throw new Error('请先登录');
  }
  const user = userRes.data[0];
  const userId = user._id;

  if (user.role === 'admin') {
    return { userId, role: 'admin' };
  }

  const teacherMemberRes = await db.collection('class_members')
    .where({ classId, userId, roleInClass: 'teacher', status: 'active' })
    .limit(1)
    .get();
  if (!teacherMemberRes.data || teacherMemberRes.data.length === 0) {
    throw new Error('仅管理员或班级教师可插入 demo 任务');
  }
  return { userId, role: 'teacher' };
}

/**
 * 为某个 dayNumber 生成 demo 任务列表（可后续按此模板转换真实题库）
 */
function buildDemoTasks() {
  if (Array.isArray(importedTasks) && importedTasks.length > 0) {
    return importedTasks;
  }
  return [
    {
      title: '前台欢迎语',
      content: 'Good evening, welcome to our hotel.',
      taskType: 'read_aloud',
      expectedAnswer: 'Good evening, welcome to our hotel.',
      acceptedAnswers: [
        'Good evening, welcome to the hotel.',
      ],
      keywords: ['good evening', 'welcome', 'hotel'],
      scoringConfig: {
        semanticWeight: 0.5,
        pronWeight: 0.5,
        semanticPassLine: 60,
        pronPassLine: 60,
        lang: 'en',
      },
    },
    {
      title: '询问入住天数',
      content: 'How many nights will you be staying?',
      taskType: 'read_aloud',
      expectedAnswer: 'How many nights will you be staying?',
      acceptedAnswers: [
        'How many nights are you staying?',
      ],
      keywords: ['how many nights', 'staying'],
      scoringConfig: {
        semanticWeight: 0.5,
        pronWeight: 0.5,
        semanticPassLine: 60,
        pronPassLine: 60,
        lang: 'en',
      },
    },
    {
      title: '说明早餐时间',
      content: 'Breakfast is served from six thirty to ten o\'clock.',
      taskType: 'read_aloud',
      expectedAnswer: 'Breakfast is served from six thirty to ten o\'clock.',
      acceptedAnswers: [
        'Breakfast is from six thirty to ten.',
        'Breakfast is served between six thirty and ten.',
      ],
      keywords: ['breakfast', 'six thirty', 'ten'],
      scoringConfig: {
        semanticWeight: 0.5,
        pronWeight: 0.5,
        semanticPassLine: 60,
        pronPassLine: 60,
        lang: 'en',
      },
    },
    {
      title: '帮客人叫车',
      content: 'Would you like me to call a taxi for you?',
      taskType: 'read_aloud',
      expectedAnswer: 'Would you like me to call a taxi for you?',
      acceptedAnswers: [
        'Shall I call a taxi for you?',
        'Do you want me to call a taxi for you?',
      ],
      keywords: ['call a taxi', 'for you'],
      scoringConfig: {
        semanticWeight: 0.5,
        pronWeight: 0.5,
        semanticPassLine: 60,
        pronPassLine: 60,
        lang: 'en',
      },
    },
  ];
}

exports.main = async (event, context) => {
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

    // 计算本天已有任务数量，继续累加 order
    const existingRes = await db.collection('task_items')
      .where({ classId, dayNumber: parsedDay })
      .get();
    const existing = existingRes.data || [];
    const baseOrder = existing.length === 0
      ? 1
      : (Math.max(...existing.map((t) => Number(t.order) || 0)) + 1);

    const demoTasks = buildDemoTasks();
    const now = db.serverDate();

    for (let i = 0; i < demoTasks.length; i += 1) {
      const t = demoTasks[i];
      const data = {
        classId,
        dayNumber: parsedDay,
        order: baseOrder + i,
        title: t.title,
        content: t.content,
        taskType: t.taskType || 'read_aloud',
        expectedAnswer: t.expectedAnswer,
        acceptedAnswers: t.acceptedAnswers || [],
        keywords: t.keywords || [],
        scoringConfig: t.scoringConfig || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection('task_items').add({ data });
    }

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      dayNumber: parsedDay,
      insertedCount: demoTasks.length,
    };
  } catch (error) {
    console.error('admin_seedDemoTasks error:', error);
    return { errCode: -1, errMsg: error.message || '插入 demo 任务失败' };
  }
};
