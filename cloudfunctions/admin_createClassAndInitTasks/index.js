// cloudfunctions/admin_createClassAndInitTasks/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 创建班级 + 初始化任务
 * 入参: { className, startDate, teacherUserIds?, tasks }
 * 出参: { classId, studentInviteCode, teacherInviteCode }
 */
function genInviteCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += s[Math.floor(Math.random() * s.length)];
  return code;
}

function ensureUniqueCode(existing) {
  let code = genInviteCode();
  while (existing.has(code)) {
    code = genInviteCode();
  }
  existing.add(code);
  return code;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const user = userRes.data[0];
    if (user.role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可创建班级' };
    }

    const { className, startDate, teacherUserIds = [], tasks = [] } = event;
    if (!className || !startDate) {
      return { errCode: -1, errMsg: '需要 className 和 startDate' };
    }

    const existingCodes = new Set();
    const allClasses = await db.collection('classes').get();
    (allClasses.data || []).forEach(c => {
      if (c.studentInviteCode) existingCodes.add(c.studentInviteCode);
      if (c.teacherInviteCode) existingCodes.add(c.teacherInviteCode);
      if (c.inviteCode) existingCodes.add(c.inviteCode);
    });

    const studentInviteCode = ensureUniqueCode(existingCodes);
    const teacherInviteCode = ensureUniqueCode(existingCodes);

    const endDate = startDate;
    const classRes = await db.collection('classes').add({
      data: {
        name: className,
        startDate,
        endDate,
        studentInviteCode,
        teacherInviteCode,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    const classId = classRes._id;

    for (const day of tasks) {
      const dayNumber = day.dayNumber || 1;
      const items = day.items || [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await db.collection('task_items').add({
          data: {
            classId,
            dayNumber,
            order: it.order !== undefined ? it.order : i + 1,
            title: it.title || '任务',
            content: it.content || '',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
      }
    }

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      studentInviteCode,
      teacherInviteCode
    };
  } catch (error) {
    console.error('admin_createClassAndInitTasks:', error);
    return { errCode: -1, errMsg: error.message || '创建失败' };
  }
};
