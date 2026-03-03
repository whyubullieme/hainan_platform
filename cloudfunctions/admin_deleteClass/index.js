// cloudfunctions/admin_deleteClass/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员：删除班级（级联删除 class_members）
 * 入参: { classId }
 * 出参: { ok: true }
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
    if (userRes.data[0].role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可操作' };
    }

    // 删除 class_members
    const memberRes = await db.collection('class_members').where({ classId }).get();
    for (const m of memberRes.data || []) {
      await db.collection('class_members').doc(m._id).remove();
    }

    // 删除班级
    await db.collection('classes').doc(classId).remove();

    return { errCode: 0, errMsg: 'success', ok: true };
  } catch (error) {
    console.error('admin_deleteClass:', error);
    return { errCode: -1, errMsg: error.message || '删除失败' };
  }
};
