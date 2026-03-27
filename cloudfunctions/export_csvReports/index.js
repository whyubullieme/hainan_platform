// cloudfunctions/export_csvReports/index.js
// Generate CSV reports for a class and return a temporary download URL.
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const BATCH_LIMIT = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCsv(headers, rows) {
  const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h, i) => escape(row[i])).join(','));
  }
  return '\uFEFF' + lines.join('\n'); // BOM for Excel UTF-8
}

async function fetchAllDocs(collectionName, filter, projection) {
  const all = [];
  let skip = 0;
  while (true) {
    let query = db.collection(collectionName)
      .where(filter)
      .skip(skip)
      .limit(BATCH_LIMIT);
    if (projection) {
      query = query.field(projection);
    }
    const res = await query.get();
    const data = res.data || [];
    all.push(...data);
    if (data.length < BATCH_LIMIT) break;
    skip += BATCH_LIMIT;
  }
  return all;
}

async function getUserByOpenid(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return (res.data && res.data[0]) || null;
}

async function ensureTeacherOrAdmin(classId, userId, userRole) {
  if (userRole === 'admin') return true;
  const res = await db.collection('class_members')
    .where({ classId, userId, roleInClass: 'teacher', status: 'active' })
    .limit(1)
    .get();
  if (!res.data || res.data.length === 0) {
    throw new Error('仅班级教师或管理员可导出报表');
  }
  return true;
}

function formatDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// Report generators
// ---------------------------------------------------------------------------

async function generateSubmissionsCsv(classId) {
  const submissions = await fetchAllDocs('submissions', { classId });
  if (submissions.length === 0) return toCsv(['提示'], [['该班级暂无提交记录']]);

  // Collect related IDs
  const taskItemIds = [...new Set(submissions.map((s) => s.taskItemId).filter(Boolean))];
  const userIds = [...new Set(submissions.map((s) => s.userId).filter(Boolean))];

  // Batch-fetch task_items and users
  const taskItemMap = new Map();
  if (taskItemIds.length > 0) {
    const tasks = await fetchAllDocs('task_items', { _id: db.command.in(taskItemIds) });
    tasks.forEach((t) => taskItemMap.set(t._id, t));
  }

  const userMap = new Map();
  if (userIds.length > 0) {
    const users = await fetchAllDocs('users', { _id: db.command.in(userIds) });
    users.forEach((u) => userMap.set(u._id, u));
  }

  const headers = ['学生姓名', '学生ID', '任务名称', '任务类型', '天数', '得分', '是否需要重做', '提交时间'];
  const rows = submissions.map((s) => {
    const user = userMap.get(s.userId) || {};
    const task = taskItemMap.get(s.taskItemId) || {};
    return [
      user.name || user.nickname || s.userId || '',
      s.userId || '',
      task.title || task.name || s.taskItemId || '',
      task.taskType || '',
      s.dayNumber || '',
      s.score != null ? s.score : '',
      s.needsRedo ? '是' : '否',
      formatDate(s.createdAt)
    ];
  });

  return toCsv(headers, rows);
}

async function generateDialogueSessionsCsv(classId) {
  // dialogue_sessions may store classId directly
  const sessions = await fetchAllDocs('dialogue_sessions', { classId });
  if (sessions.length === 0) return toCsv(['提示'], [['该班级暂无对话记录']]);

  const userIds = [...new Set(sessions.map((s) => s.userId).filter(Boolean))];
  const userMap = new Map();
  if (userIds.length > 0) {
    const users = await fetchAllDocs('users', { _id: db.command.in(userIds) });
    users.forEach((u) => userMap.set(u._id, u));
  }

  const headers = ['学生姓名', '学生ID', '场景名称', '等级', '总分', '最终评分', '是否通过', '评估状态', '轮次数', '创建时间'];
  const rows = sessions.map((s) => {
    const user = userMap.get(s.userId) || {};
    return [
      user.name || user.nickname || s.userId || '',
      s.userId || '',
      s.sceneName || '',
      s.level || '',
      s.totalScore != null ? s.totalScore : '',
      s.finalScore != null ? s.finalScore : '',
      s.passed ? '通过' : '未通过',
      s.evaluationStatus || '',
      s.turns ? s.turns.length : (s.turnCount || ''),
      formatDate(s.createdAt)
    ];
  });

  return toCsv(headers, rows);
}

async function generateOverviewCsv(classId) {
  // Get all students in the class
  const members = await fetchAllDocs('class_members', {
    classId,
    roleInClass: 'student',
    status: 'active'
  });

  if (members.length === 0) return toCsv(['提示'], [['该班级暂无学生']]);

  const studentIds = members.map((m) => m.userId).filter(Boolean);
  const userMap = new Map();
  if (studentIds.length > 0) {
    const users = await fetchAllDocs('users', { _id: db.command.in(studentIds) });
    users.forEach((u) => userMap.set(u._id, u));
  }

  // Get all submissions for the class
  const submissions = await fetchAllDocs('submissions', { classId }, {
    userId: true, score: true
  });

  // Aggregate per student
  const studentStats = new Map();
  studentIds.forEach((id) => studentStats.set(id, { count: 0, totalScore: 0, scored: 0 }));
  submissions.forEach((s) => {
    const stat = studentStats.get(s.userId);
    if (!stat) return;
    stat.count += 1;
    if (s.score != null && !Number.isNaN(Number(s.score))) {
      stat.totalScore += Number(s.score);
      stat.scored += 1;
    }
  });

  const headers = ['学生姓名', '学生ID', '提交总数', '有分数的提交数', '平均分'];
  const rows = studentIds.map((id) => {
    const user = userMap.get(id) || {};
    const stat = studentStats.get(id) || { count: 0, totalScore: 0, scored: 0 };
    const avg = stat.scored > 0 ? (stat.totalScore / stat.scored).toFixed(1) : '';
    return [
      user.name || user.nickname || id,
      id,
      stat.count,
      stat.scored,
      avg
    ];
  });

  return toCsv(headers, rows);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, type } = event;

  if (!openid) return { errCode: -1, errMsg: '无法获取用户身份' };
  if (!classId) return { errCode: -1, errMsg: '缺少 classId' };
  if (!type || !['submissions', 'dialogue_sessions', 'overview'].includes(type)) {
    return { errCode: -1, errMsg: 'type 必须为 submissions / dialogue_sessions / overview' };
  }

  try {
    // Auth check
    const user = await getUserByOpenid(openid);
    if (!user) return { errCode: -1, errMsg: '请先登录' };
    await ensureTeacherOrAdmin(classId, user._id, user.role);

    // Generate CSV content
    let csvContent;
    let filePrefix;
    if (type === 'submissions') {
      csvContent = await generateSubmissionsCsv(classId);
      filePrefix = 'submissions';
    } else if (type === 'dialogue_sessions') {
      csvContent = await generateDialogueSessionsCsv(classId);
      filePrefix = 'dialogue_sessions';
    } else {
      csvContent = await generateOverviewCsv(classId);
      filePrefix = 'overview';
    }

    // Upload to cloud storage
    const timestamp = Date.now();
    const fileName = `${filePrefix}_${classId}_${timestamp}.csv`;
    const cloudPath = `exports/${fileName}`;

    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(csvContent, 'utf-8')
    });

    if (!uploadRes.fileID) {
      return { errCode: -1, errMsg: '文件上传失败' };
    }

    // Get temporary download URL (valid for 2 hours)
    const urlRes = await cloud.getTempFileURL({
      fileList: [uploadRes.fileID]
    });

    const fileInfo = urlRes.fileList && urlRes.fileList[0];
    if (!fileInfo || fileInfo.status !== 0) {
      return { errCode: -1, errMsg: '获取下载链接失败' };
    }

    return {
      errCode: 0,
      errMsg: 'success',
      csvUrl: fileInfo.tempFileURL,
      fileName
    };
  } catch (error) {
    console.error('export_csvReports error:', error);
    return { errCode: -1, errMsg: error.message || '导出失败' };
  }
};
