// cloudfunctions/admin_updateMemberRole/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员：更新成员角色（student <-> teacher）
 * 入参: { classId, memberId, roleInClass }  memberId 为 class_members._id
 * 出参: { ok: true }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, memberId, roleInClass } = event;

  if (!openid || !classId || !memberId || !roleInClass) {
    return { errCode: -1, errMsg: '参数缺少 classId, memberId, roleInClass' };
  }

  if (!['student', 'teacher'].includes(roleInClass)) {
    return { errCode: -1, errMsg: 'roleInClass 需为 student 或 teacher' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    if (userRes.data[0].role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可操作' };
    }

    const memberDoc = await db.collection('class_members').doc(memberId).get();
    if (!memberDoc.data) {
      return { errCode: -1, errMsg: '成员不存在' };
    }
    if (memberDoc.data.classId !== classId) {
      return { errCode: -1, errMsg: '成员不属于该班级，无法修改角色' };
    }

    await db.collection('class_members').doc(memberId).update({
      data: { roleInClass }
    });

    return { errCode: 0, errMsg: 'success', ok: true };
  } catch (error) {
    console.error('admin_updateMemberRole:', error);
    return { errCode: -1, errMsg: error.message || '更新失败' };
  }
};
