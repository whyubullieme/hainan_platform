// cloudfunctions/admin_listUsers/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员：搜索用户（按姓名，用于添加成员）
 * 入参: { keyword?, limit? }  keyword 可选，limit 默认 20
 * 出参: { users: [{ _id, name }] }
 */
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
    if (userRes.data[0].role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可操作' };
    }

    const rawKeyword = event.keyword;
    const keyword = (typeof rawKeyword === 'string' ? rawKeyword : '').trim();
    const limit = Math.min(50, Math.max(1, event.limit || 20));

    const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const res = keyword
      ? await db.collection('users')
          .where({ name: db.RegExp({ regexp: '.*' + escapeRe(keyword) + '.*', options: 'i' }) })
          .limit(limit)
          .get()
      : await db.collection('users').limit(limit).get();
    const users = (res.data || []).map(u => ({
      _id: u._id,
      name: u.name || '—'
    }));

    return { errCode: 0, errMsg: 'success', users };
  } catch (error) {
    console.error('admin_listUsers:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
