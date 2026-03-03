// cloudfunctions/admin_updateClass/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员：更新班级信息
 * 入参: { classId, name?, startDate?, endDate?, totalDays? }
 * totalDays: 课程总天数（1-90），修改后自动重算 endDate
 * 出参: { ok: true }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, name, startDate, endDate, totalDays: inputTotalDays } = event;

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

    const clsRes = await db.collection('classes').doc(classId).get();
    const cls = clsRes.data;
    if (!cls) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    const updateData = { updatedAt: db.serverDate() };
    if (name != null && String(name).trim()) updateData.name = String(name).trim();
    if (startDate != null) updateData.startDate = startDate;
    if (endDate != null) updateData.endDate = endDate;

    if (inputTotalDays != null) {
      const totalDays = Math.max(1, Math.min(90, Number(inputTotalDays) || 14));
      updateData.totalDays = totalDays;
      const baseDate = updateData.startDate || cls.startDate;
      const startD = new Date(baseDate);
      const endD = new Date(startD);
      endD.setDate(endD.getDate() + totalDays - 1);
      updateData.endDate = endD.getFullYear() + '-' + String(endD.getMonth() + 1).padStart(2, '0') + '-' + String(endD.getDate()).padStart(2, '0');
    }

    if (Object.keys(updateData).length <= 1) {
      return { errCode: -1, errMsg: '无有效更新字段' };
    }

    await db.collection('classes').doc(classId).update({ data: updateData });
    return { errCode: 0, errMsg: 'success', ok: true };
  } catch (error) {
    console.error('admin_updateClass:', error);
    return { errCode: -1, errMsg: error.message || '更新失败' };
  }
};
