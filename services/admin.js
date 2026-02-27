// services/admin.js
const api = require('./api');

const adminService = {
  createClassAndInitTasks(params) {
    return api.callCloudFunction('admin_createClassAndInitTasks', params);
  }
};

module.exports = adminService;
