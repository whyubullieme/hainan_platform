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
  }
};

module.exports = studentService;
