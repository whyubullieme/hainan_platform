// cloudfunctions/admin_cleanupDuplicates/index.js
// One-time cleanup: deduplicate task_items by (title + taskType + normalized content).
// For each duplicate group:
//   1. Keep the oldest record as the "master"
//   2. Update any submissions referencing deleted IDs → master ID
//   3. Delete duplicates
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const BATCH = 100;

async function fetchAll(collection, filter) {
  const all = [];
  let skip = 0;
  while (true) {
    const res = await db.collection(collection).where(filter || {}).skip(skip).limit(BATCH).get();
    const data = res.data || [];
    all.push(...data);
    if (data.length < BATCH) break;
    skip += BATCH;
  }
  return all;
}

function normalizeKey(t) {
  const title = (t.title || '').trim();
  const taskType = t.taskType || '';
  // For listening_mcq, use ttsText as the content key (title is always "听力训练")
  const content = taskType === 'listening_mcq'
    ? (t.ttsText || '').trim().slice(0, 100)
    : (t.content || t.expectedAnswer || '').trim().slice(0, 100);
  return `${taskType}||${title}||${content}`;
}

exports.main = async (event = {}) => {
  const { dryRun = true } = event; // default to dry run for safety

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // Auth check — admin only
  if (openid) {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data.length || userRes.data[0].role !== 'admin') {
      return { errCode: -1, errMsg: '仅管理员可执行去重' };
    }
  }

  try {
    const allTasks = await fetchAll('task_items');
    console.log(`Total task_items: ${allTasks.length}`);

    // Group by normalized key
    const groups = {};
    for (const t of allTasks) {
      const key = normalizeKey(t);
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }

    const duplicateGroups = Object.entries(groups).filter(([, items]) => items.length > 1);
    console.log(`Duplicate groups: ${duplicateGroups.length}`);

    let totalToDelete = 0;
    let totalSubmissionsUpdated = 0;
    const deleteIds = [];
    const idRemapping = {}; // oldId → masterId

    for (const [key, items] of duplicateGroups) {
      // Sort by createdAt ascending — keep the oldest as master
      items.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      });

      const master = items[0];
      const dupes = items.slice(1);

      for (const d of dupes) {
        deleteIds.push(d._id);
        idRemapping[d._id] = master._id;
      }
      totalToDelete += dupes.length;
    }

    if (dryRun) {
      return {
        errCode: 0,
        errMsg: 'dry run — no changes made',
        dryRun: true,
        totalTasks: allTasks.length,
        duplicateGroups: duplicateGroups.length,
        toDelete: totalToDelete,
        toKeep: allTasks.length - totalToDelete,
        sampleDuplicates: duplicateGroups.slice(0, 5).map(([key, items]) => ({
          key,
          count: items.length,
          masterId: items[0]._id,
          masterTitle: items[0].title,
          duplicateIds: items.slice(1).map(i => i._id),
        })),
      };
    }

    // === ACTUAL CLEANUP ===

    // 1. Update submissions that reference deleted IDs
    const oldIds = Object.keys(idRemapping);
    if (oldIds.length > 0) {
      // Process in batches
      for (let i = 0; i < oldIds.length; i += 50) {
        const batch = oldIds.slice(i, i + 50);
        const subs = await fetchAll('submissions', { taskItemId: _.in(batch) });
        for (const sub of subs) {
          const newId = idRemapping[sub.taskItemId];
          if (newId) {
            await db.collection('submissions').doc(sub._id).update({
              data: { taskItemId: newId, _migratedFrom: sub.taskItemId }
            });
            totalSubmissionsUpdated++;
          }
        }
      }
    }

    // 2. Delete duplicate task_items
    let deletedCount = 0;
    for (const id of deleteIds) {
      try {
        await db.collection('task_items').doc(id).remove();
        deletedCount++;
      } catch (e) {
        console.warn(`Failed to delete ${id}:`, e.message);
      }
    }

    // 3. Ensure masters have classId preserved (keep the first one's classId/dayNumber)
    // Masters already have their original data, no changes needed.

    return {
      errCode: 0,
      errMsg: 'cleanup complete',
      dryRun: false,
      totalTasks: allTasks.length,
      duplicateGroups: duplicateGroups.length,
      deleted: deletedCount,
      submissionsUpdated: totalSubmissionsUpdated,
      remaining: allTasks.length - deletedCount,
    };
  } catch (error) {
    console.error('admin_cleanupDuplicates error:', error);
    return { errCode: -1, errMsg: error.message || '去重失败' };
  }
};
