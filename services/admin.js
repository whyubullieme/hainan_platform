// services/admin.js
const api = require('./api');

const adminService = {
  createClassAndInitTasks(params) {
    return api.callCloudFunction('admin_createClassAndInitTasks', params);
  },
  listClasses() {
    return api.callCloudFunction('admin_listClasses', {});
  },
  getClassDetail(params) {
    return api.callCloudFunction('admin_getClassDetail', params);
  },
  updateClass(params) {
    return api.callCloudFunction('admin_updateClass', params);
  },
  deleteClass(params) {
    return api.callCloudFunction('admin_deleteClass', params);
  },
  listUsers(params = {}) {
    return api.callCloudFunction('admin_listUsers', params);
  },
  addMember(params) {
    return api.callCloudFunction('admin_addMember', params);
  },
  updateMemberRole(params) {
    return api.callCloudFunction('admin_updateMemberRole', params);
  },
  removeMember(params) {
    return api.callCloudFunction('admin_removeMember', params);
  }
};

module.exports = adminService;
