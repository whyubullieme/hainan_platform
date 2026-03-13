// services/student.js
const api = require('./api');

const studentService = {
  /**
   * 获取今日计划 + 状态
   * @param {object} params { classId, date? }
   */
  getTodayPlan(params) {
    return api.callCloudFunction('student_getTodayPlan', params);
  },

  /**
   * 签到
   * @param {object} params { classId, dayNumber }
   */
  markCheckin(params) {
    return api.callCloudFunction('student_markProgress', {
      ...params,
      action: 'checkin'
    });
  },

  /**
   * 获取我的提交记录
   * @param {object} params { classId, date? } date 可选 YYYY-MM-DD
   */
  getMySubmissions(params) {
    return api.callCloudFunction('student_getMySubmissions', params);
  },

  /**
   * 获取老师点评
   */
  getMyReviews(params) {
    return api.callCloudFunction('student_getMyReviews', params);
  },

  /**
   * 获取完整训练计划（全部任务）
   */
  getFullPlan(params) {
    return api.callCloudFunction('student_getFullPlan', params);
  },

  /**
   * 获取单个任务详情
   * @param {object} params { taskId }
   */
  getTaskDetail(params) {
    return api.callCloudFunction('student_getTaskDetail', params);
  },

  /**
   * 提交任务
   * @param {object} params { classId, dayNumber, taskItemId, note? }
   */
  markSubmit(params) {
    return api.callCloudFunction('student_markProgress', {
      ...params,
      action: 'submit'
    });
  },

  /**
   * 讯飞 TTS 合成并返回可播放临时 URL
   * @param {object} params { text, voice? }
   */
  synthesizeXfyunTts(params) {
    return api.callCloudFunction('tts_synthesizeXfyun', params);
  },

  /**
   * 获取听力 session（同一天 listening_mcq 连续作答）
   */
  getListeningSession(params) {
    return api.callCloudFunction('student_getListeningSession', params);
  },

  /**
   * 提交听力 session，返回正确答案与得分
   */
  submitListeningSession(params) {
    return api.callCloudFunction('student_submitListeningSession', params);
  }
};

module.exports = studentService;
