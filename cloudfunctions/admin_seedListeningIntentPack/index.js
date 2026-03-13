const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PACK_CODE = 'hotel_listening_intent_v1';

async function ensureAdminOrTeacher(classId, openid) {
  if (!classId) {
    throw new Error('缺少 classId');
  }

  // 支持云函数控制台调用（无 openid 时默认 admin）
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
    throw new Error('仅管理员或班级教师可导入题包');
  }

  return { userId, role: 'teacher' };
}

function buildListeningIntentTasks() {
  return [
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'Hi, I just arrived and I may need to wait for my friend. Could you tell me how much one night in a standard room is?',
      options: [
        { key: 'A', text: '他想让酒店帮忙叫出租车。' },
        { key: 'B', text: '他想询问标准间每晚价格。' },
        { key: 'C', text: '他想申请延迟退房。' },
        { key: 'D', text: '他想更换到无烟房。' },
      ],
      correctOptionKey: 'B',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'Good evening. I have already checked in and the room is nice, but I cannot connect my laptop. Could you tell me the Wi-Fi password?',
      options: [
        { key: 'A', text: '他想预约明天的早餐。' },
        { key: 'B', text: '他想投诉空调太冷。' },
        { key: 'C', text: '他想询问 Wi-Fi 密码。' },
        { key: 'D', text: '他想换成大床房。' },
      ],
      correctOptionKey: 'C',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'I have an early meeting tomorrow morning. Before I plan my schedule, could you let me know what time check-out is?',
      options: [
        { key: 'A', text: '他想询问退房时间。' },
        { key: 'B', text: '他想预订会议室。' },
        { key: 'C', text: '他想请前台叫醒。' },
        { key: 'D', text: '他想买早餐券。' },
      ],
      correctOptionKey: 'A',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'My train leaves in about an hour, and I still need to pack my things. Could you help me call a taxi to the station?',
      options: [
        { key: 'A', text: '他想取消今晚的房间。' },
        { key: 'B', text: '他想询问出租车费用。' },
        { key: 'C', text: '他想让酒店帮忙叫车去车站。' },
        { key: 'D', text: '他想申请提前入住。' },
      ],
      correctOptionKey: 'C',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'I am traveling with my parents, so we want to get up early. Could you tell me what time breakfast starts?',
      options: [
        { key: 'A', text: '他想知道早餐开始时间。' },
        { key: 'B', text: '他想让酒店准备夜宵。' },
        { key: 'C', text: '他想询问泳池开放时间。' },
        { key: 'D', text: '他想要三张房卡。' },
      ],
      correctOptionKey: 'A',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'Sorry to bother you. I have tried for ten minutes, but the air conditioner in my room is still not working. Could someone check it?',
      options: [
        { key: 'A', text: '他想续住一晚。' },
        { key: 'B', text: '他想让人来维修空调。' },
        { key: 'C', text: '他想问健身房在哪。' },
        { key: 'D', text: '他想多要一条毛巾。' },
      ],
      correctOptionKey: 'B',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'My child is joining us tonight, and we only booked one queen bed. Is it possible to add an extra bed in the room?',
      options: [
        { key: 'A', text: '他想问是否可以加床。' },
        { key: 'B', text: '他想换到套房。' },
        { key: 'C', text: '他想取消订单。' },
        { key: 'D', text: '他想预订机场接送。' },
      ],
      correctOptionKey: 'A',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'My flight is in the evening, so I still need a place to rest in the afternoon. Could I have a late check-out?',
      options: [
        { key: 'A', text: '他想提前入住。' },
        { key: 'B', text: '他想申请延迟退房。' },
        { key: 'C', text: '他想预订晚餐。' },
        { key: 'D', text: '他想请前台换外币。' },
      ],
      correctOptionKey: 'B',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'Everything is good so far, but my wife is sensitive to smoke. Do you have any non-smoking rooms available?',
      options: [
        { key: 'A', text: '他想问是否有无烟房。' },
        { key: 'B', text: '他想问是否有儿童床。' },
        { key: 'C', text: '他想询问停车收费。' },
        { key: 'D', text: '他想预约机场巴士。' },
      ],
      correctOptionKey: 'A',
    },
    {
      title: '听力训练',
      content: '听一段话，判断说话者主要想问什么。',
      taskType: 'listening_mcq',
      ttsText: 'I checked out this morning, but my bus is not until 6 p.m. Could you keep my luggage for a few hours?',
      options: [
        { key: 'A', text: '他想问是否可以延迟入住。' },
        { key: 'B', text: '他想询问行李寄存服务。' },
        { key: 'C', text: '他想申请房费折扣。' },
        { key: 'D', text: '他想加订一晚房间。' },
      ],
      correctOptionKey: 'B',
    },
  ];
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
}

function groupByDay(tasks, startDayNumber, dailyCount) {
  const grouped = [];
  for (let i = 0; i < tasks.length; i += dailyCount) {
    grouped.push({
      dayNumber: startDayNumber + Math.floor(i / dailyCount),
      tasks: tasks.slice(i, i + dailyCount),
    });
  }
  return grouped;
}

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const classId = (event.classId || '').trim();
  const startDayNumber = parsePositiveInt(event.startDayNumber, 1);
  const dailyCount = parsePositiveInt(event.dailyCount, 3);
  const replace = !!event.replace;

  if (!classId) {
    return { errCode: -1, errMsg: '缺少 classId' };
  }
  if (dailyCount > 10) {
    return { errCode: -1, errMsg: 'dailyCount 过大，建议 1~10' };
  }

  try {
    await ensureAdminOrTeacher(classId, openid);

    const classRes = await db.collection('classes').doc(classId).get();
    if (!classRes.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    const tasks = buildListeningIntentTasks();
    const dayGroups = groupByDay(tasks, startDayNumber, dailyCount);
    const dayNumbers = dayGroups.map((g) => g.dayNumber);

    if (replace) {
      const oldRes = await db.collection('task_items')
        .where({
          classId,
          sourcePack: PACK_CODE,
          dayNumber: _.in(dayNumbers),
        })
        .get();
      const oldList = oldRes.data || [];
      for (const old of oldList) {
        await db.collection('task_items').doc(old._id).remove();
      }
    }

    let insertedCount = 0;
    const insertedDays = [];

    for (const group of dayGroups) {
      const dayNumber = group.dayNumber;
      const existingRes = await db.collection('task_items')
        .where({ classId, dayNumber })
        .get();
      const existing = existingRes.data || [];
      const baseOrder = existing.length === 0 ? 1 : (Math.max(...existing.map((t) => Number(t.order) || 0)) + 1);

      for (let i = 0; i < group.tasks.length; i += 1) {
        const t = group.tasks[i];
        const data = {
          classId,
          dayNumber,
          order: baseOrder + i,
          title: t.title,
          content: t.content,
          taskType: 'listening_mcq',
          ttsText: t.ttsText,
          options: t.options,
          correctOptionKey: t.correctOptionKey,
          sourcePack: PACK_CODE,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        };
        await db.collection('task_items').add({ data });
        insertedCount += 1;
      }

      insertedDays.push({ dayNumber, count: group.tasks.length });
    }

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      startDayNumber,
      dailyCount,
      totalQuestions: tasks.length,
      insertedCount,
      insertedDays,
      packCode: PACK_CODE,
      replace,
    };
  } catch (error) {
    console.error('admin_seedListeningIntentPack error:', error);
    return { errCode: -1, errMsg: error.message || '导入失败' };
  }
};
