// services/auth.js
/**
 * 认证相关 API
 */

const api = require('./api');

const authService = {
    getOrCreateUser(params = {}) {
        return api.callCloudFunction('auth_getOrCreateUser', params);
    },
    /**
     * 管理员登录（密码 test123）
     * @param {object} params { password, name? } 首次需填 name
     */
    adminLogin(params = {}) {
        return api.callCloudFunction('auth_adminLogin', params);
    }
};

module.exports = authService;

