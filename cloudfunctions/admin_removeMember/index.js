// cloudfunctions/admin_removeMember/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员：移出班级成员
 * 入参: { classId, memberId }  memberId 为 class_members._id
 * 出参: { ok: true }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, memberId } = event;

  if (!openid || !classId || !memberId) {
    return { errCode: -1, errMsg: '参数缺少 classId, memberId' };
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
      return { errCode: -1, errMsg: '成员不属于该班级，无法移除' };
    }

    await db.collection('class_members').doc(memberId).remove();
    return { errCode: 0, errMsg: 'success', ok: true };
  } catch (error) {
    console.error('admin_removeMember:', error);
    return { errCode: -1, errMsg: error.message || '移除失败' };
  }
};
