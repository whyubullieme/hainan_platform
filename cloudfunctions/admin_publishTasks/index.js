const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function getOperator() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    return { userId: '', role: 'admin' };
  }
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  if (!userRes.data || userRes.data.length === 0) {
    throw new Error('请先登录');
  }
  const user = userRes.data[0];
  if (user.role !== 'admin') {
    throw new Error('仅管理员可发布题库');
  }
  return { userId: user._id, role: user.role };
}

exports.main = async (event = {}) => {
  const { taskIds = [], versionTag = '' } = event;

  try {
    const operator = await getOperator();
    const now = db.serverDate();
    const publishData = {
      status: 'published',
      versionTag: String(versionTag || '').trim(),
      publishedAt: now,
      publishedBy: operator.userId,
      updatedAt: now,
    };

    if (Array.isArray(taskIds) && taskIds.length > 0) {
      let updated = 0;
      for (const taskId of taskIds) {
        if (!taskId) continue;
        // eslint-disable-next-line no-await-in-loop
        const res = await db.collection('task_items').doc(taskId).update({ data: publishData });
        updated += (res && res.stats && res.stats.updated) ? res.stats.updated : (res.updated || 0);
      }
      return { errCode: 0, errMsg: 'success', updated };
    }

    const whereFilter = {
      isTemplate: true,
      status: _.neq('published'),
    };
    const res = await db.collection('task_items').where(whereFilter).update({ data: publishData });
    const updated = (res && res.stats && res.stats.updated) ? res.stats.updated : (res.updated || 0);
    return { errCode: 0, errMsg: 'success', updated };
  } catch (error) {
    console.error('admin_publishTasks error:', error);
    return { errCode: -1, errMsg: error.message || '发布失败' };
  }
};
