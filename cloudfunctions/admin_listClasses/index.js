// cloudfunctions/admin_listClasses/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const BATCH_LIMIT = 100;

async function fetchAllDocs(collectionName, options = {}) {
  const { where = {}, orderByField, orderByDirection = 'desc' } = options;
  const all = [];
  let skip = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = db.collection(collectionName)
      .where(where)
      .skip(skip)
      .limit(BATCH_LIMIT);
    if (orderByField) {
      query = query.orderBy(orderByField, orderByDirection);
    }
    // eslint-disable-next-line no-await-in-loop
    const res = await query.get();
    const data = res.data || [];
    all.push(...data);
    if (data.length < BATCH_LIMIT) break;
    skip += BATCH_LIMIT;
  }
  return all;
}

/**
 * 管理员：获取所有班级列表（含成员统计）
 * 入参: 无
 * 出参: { classes: [{ _id, name, startDate, endDate, studentInviteCode, teacherInviteCode, studentCount, teacherCount }] }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    if (userRes.data[0].role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可操作' };
    }

    const classes = await fetchAllDocs('classes', {
      orderByField: 'createdAt',
      orderByDirection: 'desc'
    });

    const memberList = await fetchAllDocs('class_members');

    const countByClass = {};
    for (const m of memberList) {
      const k = m.classId;
      if (!k) continue;
      if (!countByClass[k]) countByClass[k] = { student: 0, teacher: 0 };
      if (m.roleInClass === 'teacher') countByClass[k].teacher++;
      else countByClass[k].student++;
    }

    const result = classes.map((c) => ({
      _id: c._id,
      name: c.name || '',
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      studentInviteCode: c.studentInviteCode || '',
      teacherInviteCode: c.teacherInviteCode || '',
      studentCount: (countByClass[c._id] && countByClass[c._id].student) || 0,
      teacherCount: (countByClass[c._id] && countByClass[c._id].teacher) || 0
    }));

    return { errCode: 0, errMsg: 'success', classes: result };
  } catch (error) {
    console.error('admin_listClasses:', error);
    return { errCode: -1, errMsg: error.message || '获取失败' };
  }
};
