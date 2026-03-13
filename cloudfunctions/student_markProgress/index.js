// cloudfunctions/student_markProgress/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 签到 + 提交 合并接口
 * 打卡: { classId, dayNumber, action: "checkin" }
 * 提交: { classId, dayNumber, action: "submit", taskItemId, note?, audioFileId?, audioFileName? }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { classId, dayNumber, action } = event;

  if (!openid || !classId || !action) {
    return { errCode: -1, errMsg: '参数缺少 classId, action' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || userRes.data.length === 0) {
      return { errCode: -1, errMsg: '请先登录' };
    }
    const userId = userRes.data[0]._id;

    // 校验当前用户是否属于该班级
    const memberRes = await db.collection('class_members')
      .where({ classId, userId, status: 'active' })
      .limit(1)
      .get();
    if (!memberRes.data || memberRes.data.length === 0) {
      return { errCode: -1, errMsg: '当前用户不属于该班级，无法操作进度' };
    }

    if (action === 'checkin') {
      const parsedDayNumber = Number.parseInt(dayNumber, 10);
      if (Number.isNaN(parsedDayNumber) || parsedDayNumber < 1) {
        return { errCode: -1, errMsg: 'dayNumber 无效' };
      }

      // 签到：upsert checkins（同一用户同一天约定一条记录）
      const exist = await db.collection('checkins')
        .where({ classId, userId, dayNumber: parsedDayNumber })
        .limit(1)
        .get();
      if (exist.data && exist.data.length > 0) {
        return { errCode: 0, errMsg: 'success', ok: true };
      }
      await db.collection('checkins').add({
        data: {
          classId,
          userId,
          dayNumber: parsedDayNumber,
          status: 'done',
          createdAt: db.serverDate()
        }
      });
    } else if (action === 'submit') {
      const { taskItemId, note, audioFileId, audioFileName } = event;
      if (!taskItemId) {
        return { errCode: -1, errMsg: '提交需要 taskItemId' };
      }
      let normalizedNote = typeof note === 'string' ? note.trim() : '';
      let normalizedAudioFileId = typeof audioFileId === 'string' ? audioFileId.trim() : '';
      let normalizedAudioFileName = typeof audioFileName === 'string' ? audioFileName.trim() : '';

      // 校验任务是否属于该班级
      const taskDoc = await db.collection('task_items').doc(taskItemId).get();
      if (!taskDoc.data) {
        return { errCode: -1, errMsg: '任务不存在' };
      }
      const task = taskDoc.data;
      if (task.classId !== classId) {
        return { errCode: -1, errMsg: '任务不属于当前班级，无法提交' };
      }
      const taskDayNumber = Number(task.dayNumber) || Number.parseInt(dayNumber, 10) || 1;
      const taskType = task.taskType || 'read_along';
      if (taskType === 'read_along') {
        if (!normalizedAudioFileId || !normalizedNote) {
          return { errCode: -1, errMsg: '跟读任务需提交音频和文字' };
        }
      } else if (taskType === 'listening_mcq') {
        if (!normalizedNote) {
          return { errCode: -1, errMsg: '听力选择题需提交答案' };
        }
        // 听力选择题默认只收答案，忽略上传音频
        normalizedAudioFileId = '';
        normalizedAudioFileName = '';
      } else if (!normalizedNote && !normalizedAudioFileId) {
        return { errCode: -1, errMsg: '请填写文字或上传音频后再提交' };
      }

      // 重复提交时更新内容（支持先提文字后补音频，或重新上传音频）
      const exist = await db.collection('submissions')
        .where({ classId, userId, dayNumber: taskDayNumber, taskItemId })
        .limit(1)
        .get();
      let submissionId;
      if (exist.data && exist.data.length > 0) {
        submissionId = exist.data[0]._id;
        const updateData = {
          note: normalizedNote,
          audioFileId: normalizedAudioFileId,
          audioFileName: normalizedAudioFileName,
          status: 'recorded',
          evaluationError: null,
          asrText: '',
          semanticScore: null,
          pronScore: null,
          finalScore: null,
          semanticPassed: null,
          pronDetails: null,
          needsRedo: false,
          redoComment: '',
          redoAt: null,
          redoByTeacherId: '',
          updatedAt: db.serverDate()
        };
        if (normalizedAudioFileId) {
          updateData.evaluationStatus = 'pending';
        }
        await db.collection('submissions').doc(submissionId).update({
          data: updateData
        });
      } else {
        const addData = {
          classId,
          userId,
          dayNumber: taskDayNumber,
          taskItemId,
          channel: 'wechat_group',
          note: normalizedNote,
          audioFileId: normalizedAudioFileId,
          audioFileName: normalizedAudioFileName,
          status: 'recorded',
          needsRedo: false,
          redoComment: '',
          redoAt: null,
          redoByTeacherId: '',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        };
        if (normalizedAudioFileId) {
          addData.evaluationStatus = 'pending';
        }
        const addRes = await db.collection('submissions').add({
          data: addData
        });
        submissionId = addRes._id;
      }

      // 有音频时异步触发 AI 评测（不 await，避免超时）
      if (normalizedAudioFileId && submissionId) {
        cloud.callFunction({ name: 'ai_evaluateSubmission', data: { submissionId } })
          .catch((err) => console.error('ai_evaluateSubmission trigger error:', err));
      }

      return {
        errCode: 0,
        errMsg: 'success',
        ok: true,
        updated: !!(exist.data && exist.data.length > 0),
        submissionId
      };
    } else {
      return { errCode: -1, errMsg: 'action 需为 checkin 或 submit' };
    }

    return { errCode: 0, errMsg: 'success', ok: true };
  } catch (error) {
    console.error('student_markProgress:', error);
    return { errCode: -1, errMsg: error.message || '操作失败' };
  }
};
