// services/teacher.js
const api = require('./api');

const teacherService = {
  getOverview(params) {
    return api.callCloudFunction('teacher_getOverview', params);
  },
  listStudentsByStatus(params) {
    return api.callCloudFunction('teacher_listStudentsByStatus', params);
  },
  saveReview(params) {
    return api.callCloudFunction('teacher_saveReview', params);
  },
  addDayTasks(params) {
    return api.callCloudFunction('teacher_addDayTasks', params);
  }
};

module.exports = teacherService;
