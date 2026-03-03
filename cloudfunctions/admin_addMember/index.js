// cloudfunctions/admin_addMember/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员：添加班级成员
 * 入参: { classId, userId, roleInClass }  roleInClass: student | teacher
 * 出参: { ok: true } 或已存在则返回已有 roleInClass
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, userId, roleInClass } = event;

  if (!openid || !classId || !userId || !roleInClass) {
    return { errCode: -1, errMsg: '参数缺少 classId, userId, roleInClass' };
  }

  if (!['student', 'teacher'].includes(roleInClass)) {
    return { errCode: -1, errMsg: 'roleInClass 需为 student 或 teacher' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    if (userRes.data[0].role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可操作' };
    }

    const exist = await db.collection('class_members')
      .where({ classId, userId })
      .get();

    if (exist.data && exist.data.length > 0) {
      return { errCode: -1, errMsg: '该用户已在班级中' };
    }

    await db.collection('class_members').add({
      data: {
        classId,
        userId,
        roleInClass,
        joinedAt: db.serverDate(),
        status: 'active'
      }
    });

    return { errCode: 0, errMsg: 'success', ok: true };
  } catch (error) {
    console.error('admin_addMember:', error);
    return { errCode: -1, errMsg: error.message || '添加失败' };
  }
};
