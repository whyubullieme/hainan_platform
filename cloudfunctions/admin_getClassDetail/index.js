// cloudfunctions/admin_getClassDetail/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const BATCH_LIMIT = 100;

async function fetchAllClassMembers(classId) {
  const all = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = db.collection('class_members')
      .where({ classId })
      .orderBy('joinedAt', 'asc')
      .skip(skip)
      .limit(BATCH_LIMIT);
    // eslint-disable-next-line no-await-in-loop
    const res = await query.get();
    const data = res.data || [];
    all.push(...data);
    if (data.length < BATCH_LIMIT) break;
    skip += BATCH_LIMIT;
  }
  return all;
}

function chunkIds(ids, size) {
  const batches = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}

/**
 * 管理员：获取班级详情 + 成员列表（含用户姓名）
 * 入参: { classId }
 * 出参: { class: {...}, members: [{ _id, userId, name, roleInClass, joinedAt }] }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const classId = event.classId;

  if (!openid || !classId) {
    return { errCode: -1, errMsg: '参数缺少 classId' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    if (userRes.data[0].role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可操作' };
    }

    const classRes = await db.collection('classes').doc(classId).get();
    if (!classRes.data) {
      return { errCode: -1, errMsg: '班级不存在' };
    }

    const members = await fetchAllClassMembers(classId);
    const userIds = [...new Set(members.map((m) => m.userId).filter(Boolean))];
    if (userIds.length === 0) {
      return {
        errCode: 0,
        errMsg: 'success',
        class: classRes.data,
        members: []
      };
    }

    const batches = chunkIds(userIds, BATCH_LIMIT).map((batch) =>
      db.collection('users')
        .where({ _id: _.in(batch) })
        .get()
    );
    const results = await Promise.all(batches);
    const userMap = {};
    results.forEach((res) => {
      (res.data || []).forEach((u) => {
        userMap[u._id] = u;
      });
    });

    const membersWithName = members.map((m) => ({
      _id: m._id,
      userId: m.userId,
      name: (userMap[m.userId] && userMap[m.userId].name) || '—',
      roleInClass: m.roleInClass || 'student',
      joinedAt: m.joinedAt
    }));

    return {
      errCode: 0,
      errMsg: 'success',
      class: classRes.data,
      members: membersWithName
    };
  } catch (error) {
    console.error('admin_getClassDetail:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
