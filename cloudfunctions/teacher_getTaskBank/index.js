// cloudfunctions/teacher_getTaskBank/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DEFAULT_SCORING = {
  semanticWeight: 0.5,
  pronWeight: 0.5,
  semanticPassLine: 60,
  pronPassLine: 60,
};

function buildListeningHotelSamples() {
  return [
    {
      id: 'l101',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 101,
      ttsText: 'I would like to check in.',
      options: [
        { key: 'A', text: '我想办理入住。' },
        { key: 'B', text: '我想退房。' },
        { key: 'C', text: '我想预订出租车。' },
        { key: 'D', text: '我想延迟退房。' },
      ],
      correctOptionKey: 'A',
    },
    {
      id: 'l102',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 102,
      ttsText: 'I have a reservation under Chen.',
      options: [
        { key: 'A', text: '我叫陈。' },
        { key: 'B', text: '我用陈这个名字预订了房间。' },
        { key: 'C', text: '我想取消预订。' },
        { key: 'D', text: '我想升级房型。' },
      ],
      correctOptionKey: 'B',
    },
    {
      id: 'l103',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 103,
      ttsText: 'Do you have a non-smoking room?',
      options: [
        { key: 'A', text: '你们有无烟房吗？' },
        { key: 'B', text: '你们有双床房吗？' },
        { key: 'C', text: '你们有吸烟区吗？' },
        { key: 'D', text: '你们有会议室吗？' },
      ],
      correctOptionKey: 'A',
    },
    {
      id: 'l104',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 104,
      ttsText: 'Is breakfast included?',
      options: [
        { key: 'A', text: '早餐几点开始？' },
        { key: 'B', text: '可以送早餐到房间吗？' },
        { key: 'C', text: '房费包含早餐吗？' },
        { key: 'D', text: '附近有早餐店吗？' },
      ],
      correctOptionKey: 'C',
    },
    {
      id: 'l105',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 105,
      ttsText: 'What is the Wi-Fi password?',
      options: [
        { key: 'A', text: 'Wi-Fi 在哪里连接？' },
        { key: 'B', text: 'Wi-Fi 密码是多少？' },
        { key: 'C', text: 'Wi-Fi 为什么这么慢？' },
        { key: 'D', text: '你们有免费 Wi-Fi 吗？' },
      ],
      correctOptionKey: 'B',
    },
    {
      id: 'l106',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 106,
      ttsText: 'Could I get an extra bed?',
      options: [
        { key: 'A', text: '我可以换一间更大的房吗？' },
        { key: 'B', text: '我可以多要一床被子吗？' },
        { key: 'C', text: '可以帮我加一张床吗？' },
        { key: 'D', text: '可以给我一条毛巾吗？' },
      ],
      correctOptionKey: 'C',
    },
    {
      id: 'l107',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 107,
      ttsText: 'What time is check-out?',
      options: [
        { key: 'A', text: '什么时候可以入住？' },
        { key: 'B', text: '退房时间是几点？' },
        { key: 'C', text: '前台几点下班？' },
        { key: 'D', text: '餐厅几点关门？' },
      ],
      correctOptionKey: 'B',
    },
    {
      id: 'l108',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 108,
      ttsText: 'Can I have a late check-out?',
      options: [
        { key: 'A', text: '我可以提前入住吗？' },
        { key: 'B', text: '我可以明天再付钱吗？' },
        { key: 'C', text: '我可以晚一点退房吗？' },
        { key: 'D', text: '我可以续住一晚吗？' },
      ],
      correctOptionKey: 'C',
    },
    {
      id: 'l109',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 109,
      ttsText: 'The air conditioner is not working.',
      options: [
        { key: 'A', text: '空调不工作了。' },
        { key: 'B', text: '电视机坏了。' },
        { key: 'C', text: '热水器坏了。' },
        { key: 'D', text: '门卡失效了。' },
      ],
      correctOptionKey: 'A',
    },
    {
      id: 'l110',
      title: '听力训练',
      content: '听句子，选择最合适的中文意思',
      taskType: 'listening_mcq',
      order: 110,
      ttsText: 'Could you arrange a wake-up call at six?',
      options: [
        { key: 'A', text: '请帮我在六点安排叫醒服务。' },
        { key: 'B', text: '请帮我在六点叫一辆车。' },
        { key: 'C', text: '请帮我在六点准备早餐。' },
        { key: 'D', text: '请帮我在六点打扫房间。' },
      ],
      correctOptionKey: 'A',
    },
  ];
}

function buildReadAlongFrontDeskSamples() {
  return [
    {
      id: 'r201',
      title: '跟读训练',
      content: 'Good evening, welcome to our hotel.',
      taskType: 'read_along',
      order: 201,
      expectedAnswer: 'Good evening, welcome to our hotel.',
      acceptedAnswers: ['Good evening, welcome to the hotel.'],
      keywords: ['good evening', 'welcome', 'hotel'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r202',
      title: '跟读训练',
      content: 'May I have your passport, please?',
      taskType: 'read_along',
      order: 202,
      expectedAnswer: 'May I have your passport, please?',
      acceptedAnswers: ['Could I have your passport, please?'],
      keywords: ['passport', 'please'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r203',
      title: '跟读训练',
      content: 'You are staying for two nights, right?',
      taskType: 'read_along',
      order: 203,
      expectedAnswer: 'You are staying for two nights, right?',
      acceptedAnswers: ['You will stay for two nights, right?'],
      keywords: ['two nights', 'staying'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r204',
      title: '跟读训练',
      content: 'Breakfast is served from 6:30 to 10:00.',
      taskType: 'read_along',
      order: 204,
      expectedAnswer: 'Breakfast is served from 6:30 to 10:00.',
      acceptedAnswers: ['Breakfast is served from six thirty to ten.'],
      keywords: ['breakfast', '6:30', '10:00'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r205',
      title: '跟读训练',
      content: 'The Wi-Fi password is written on your key card.',
      taskType: 'read_along',
      order: 205,
      expectedAnswer: 'The Wi-Fi password is written on your key card.',
      acceptedAnswers: ['The Wi-Fi password is on your key card.'],
      keywords: ['Wi-Fi', 'password', 'key card'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r206',
      title: '跟读训练',
      content: 'Please take the elevator to the fifth floor.',
      taskType: 'read_along',
      order: 206,
      expectedAnswer: 'Please take the elevator to the fifth floor.',
      acceptedAnswers: ['Please use the elevator to the fifth floor.'],
      keywords: ['elevator', 'fifth floor'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r207',
      title: '跟读训练',
      content: 'Would you like a room with one bed or two beds?',
      taskType: 'read_along',
      order: 207,
      expectedAnswer: 'Would you like a room with one bed or two beds?',
      acceptedAnswers: ['Do you prefer one bed or two beds?'],
      keywords: ['one bed', 'two beds', 'room'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r208',
      title: '跟读训练',
      content: 'I can arrange a wake-up call for 6 a.m.',
      taskType: 'read_along',
      order: 208,
      expectedAnswer: 'I can arrange a wake-up call for 6 a.m.',
      acceptedAnswers: ['I can set a wake-up call for six a.m.'],
      keywords: ['wake-up call', '6 a.m.'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r209',
      title: '跟读训练',
      content: 'Could you please sign here?',
      taskType: 'read_along',
      order: 209,
      expectedAnswer: 'Could you please sign here?',
      acceptedAnswers: ['Please sign here.'],
      keywords: ['sign', 'here'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r210',
      title: '跟读训练',
      content: 'Your room is ready now.',
      taskType: 'read_along',
      order: 210,
      expectedAnswer: 'Your room is ready now.',
      acceptedAnswers: ['The room is ready now.'],
      keywords: ['room', 'ready'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r211',
      title: '跟读训练',
      content: 'Would you like me to call a taxi for you?',
      taskType: 'read_along',
      order: 211,
      expectedAnswer: 'Would you like me to call a taxi for you?',
      acceptedAnswers: ['Shall I call a taxi for you?'],
      keywords: ['call', 'taxi'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r212',
      title: '跟读训练',
      content: 'We can keep your luggage at the front desk.',
      taskType: 'read_along',
      order: 212,
      expectedAnswer: 'We can keep your luggage at the front desk.',
      acceptedAnswers: ['We can store your luggage at the front desk.'],
      keywords: ['luggage', 'front desk'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r213',
      title: '跟读训练',
      content: 'Late check-out is available until 2 p.m.',
      taskType: 'read_along',
      order: 213,
      expectedAnswer: 'Late check-out is available until 2 p.m.',
      acceptedAnswers: ['You can check out late until two p.m.'],
      keywords: ['late check-out', '2 p.m.'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r214',
      title: '跟读训练',
      content: 'I am sorry for the inconvenience.',
      taskType: 'read_along',
      order: 214,
      expectedAnswer: 'I am sorry for the inconvenience.',
      acceptedAnswers: ['Sorry for the inconvenience.'],
      keywords: ['sorry', 'inconvenience'],
      scoringConfig: DEFAULT_SCORING,
    },
    {
      id: 'r215',
      title: '跟读训练',
      content: 'We will send someone to check the air conditioner.',
      taskType: 'read_along',
      order: 215,
      expectedAnswer: 'We will send someone to check the air conditioner.',
      acceptedAnswers: ['We will ask someone to check the air conditioner.'],
      keywords: ['check', 'air conditioner'],
      scoringConfig: DEFAULT_SCORING,
    },
  ];
}

/**
 * 教师：获取任务库（供“添加一天任务”时勾选）
 * 入参: 无（或 classId 仅做权限校验）
 * 出参: { tasks: [{ id, title, content, taskType, order, expectedAnswer?, acceptedAnswers?, keywords?, scoringConfig? }] }
 */
function getTaskBank() {
  return [...buildListeningHotelSamples(), ...buildReadAlongFrontDeskSamples()];
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
