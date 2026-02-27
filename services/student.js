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
