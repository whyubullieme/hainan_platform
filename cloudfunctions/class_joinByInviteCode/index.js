// cloudfunctions/class_joinByInviteCode/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 通过邀请码加入班级
 * 学生码 → roleInClass=student，教师码 → roleInClass=teacher
 * 入参: { inviteCode }
 * 出参: { classId, className, roleInClass }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const inviteCode = event.inviteCode && String(event.inviteCode).trim();

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份信息' };
  }
  if (!inviteCode) {
    return { errCode: -1, errMsg: '请输入邀请码' };
  }

  try {
    const classResult = await db.collection('classes').get();
    const allClasses = classResult.data || [];
    let cls = null;
    let roleInClass = null;

    for (const c of allClasses) {
      if (c.studentInviteCode === inviteCode) {
        cls = c;
        roleInClass = 'student';
        break;
      }
      if (c.teacherInviteCode === inviteCode) {
        cls = c;
        roleInClass = 'teacher';
        break;
      }
      if (c.inviteCode === inviteCode) {
        cls = c;
        roleInClass = 'student';
        break;
      }
    }

    if (!cls || !roleInClass) {
      return { errCode: -1, errMsg: '邀请码无效或班级不存在' };
    }

    const classId = cls._id;
    const className = cls.name || '';

    const userResult = await db.collection('users').where({ openid }).get();
    if (!userResult.data || userResult.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userResult.data[0]._id;

    const memberResult = await db.collection('class_members')
      .where({ classId, userId })
      .get();

    if (memberResult.data && memberResult.data.length > 0) {
      const member = memberResult.data[0];
      const currentRole = member.roleInClass || 'student';
      const newRole = roleInClass;
      if (newRole === 'teacher' && currentRole === 'student') {
        await db.collection('class_members').doc(member._id).update({
          data: { roleInClass: 'teacher' }
        });
        roleInClass = 'teacher';
      } else {
        roleInClass = currentRole;
      }
      return {
        errCode: 0,
        errMsg: 'success',
        classId,
        className,
        roleInClass
      };
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

    return {
      errCode: 0,
      errMsg: 'success',
      classId,
      className,
      roleInClass
    };
  } catch (error) {
    console.error('加入班级失败:', error);
    return {
      errCode: -1,
      errMsg: error.message || '加入班级失败'
    };
  }
};
