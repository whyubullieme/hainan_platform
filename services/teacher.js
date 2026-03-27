// services/teacher.js
const api = require('./api');

const teacherService = {
  getOverview(params) {
    return api.callCloudFunction('teacher_getOverview', params);
  },
  listStudentsByStatus(params) {
    return api.callCloudFunction('teacher_listStudentsByStatus', params);
  },
  getStudentSubmissions(params) {
    return api.callCloudFunction('teacher_getStudentSubmissions', params);
  },
  saveReview(params) {
    return api.callCloudFunction('teacher_saveReview', params);
  },
  getTaskBank() {
    return api.callCloudFunction('teacher_getTaskBank', {});
  },
  addDayTasks(params) {
    return api.callCloudFunction('teacher_addDayTasks', params);
  },
  revokeDayTasks(params) {
    return api.callCloudFunction('teacher_revokeDayTasks', params);
  },
  getTopErrors(params) {
    return api.callCloudFunction('teacher_getTopErrors', params);
  },
  exportCSV(params) {
    return api.callCloudFunction('export_csvReports', params);
  },
  getDialogueSessions(params) {
    return api.callCloudFunction('teacher_getDialogueSessions', params);
  }
};

module.exports = teacherService;
