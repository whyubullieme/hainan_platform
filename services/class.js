// services/class.js
const api = require('./api');

const classService = {
  /**
   * 通过邀请码加入班级
   * @param {object} params { inviteCode }
   * @returns {Promise<{ classId, className, roleInClass }>}
   */
  joinByInviteCode(params) {
    return api.callCloudFunction('class_joinByInviteCode', params);
  }
};

module.exports = classService;
