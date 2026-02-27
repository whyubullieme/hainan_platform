// utils/storage.js
/**
 * 本地存储工具类
 */

const storage = {
    /**
     * 设置存储
     * @param {string} key 键名
     * @param {any} value 值
     */
    set(key, value) {
        try {
            wx.setStorageSync(key, value);
        } catch (e) {
            console.error('存储失败:', e);
        }
    },

    /**
     * 获取存储
     * @param {string} key 键名
     * @param {any} defaultValue 默认值
     * @returns {any}
     */
    get(key, defaultValue = null) {
        try {
            const value = wx.getStorageSync(key);
            return value !== '' ? value : defaultValue;
        } catch (e) {
            console.error('读取存储失败:', e);
            return defaultValue;
        }
    },

    /**
     * 删除存储
     * @param {string} key 键名
     */
    remove(key) {
        try {
            wx.removeStorageSync(key);
        } catch (e) {
            console.error('删除存储失败:', e);
        }
    },

    /**
     * 清空所有存储
     */
    clear() {
        try {
            wx.clearStorageSync();
        } catch (e) {
            console.error('清空存储失败:', e);
        }
    },

    /**
     * 获取用户信息
     */
    getUserInfo() {
        return this.get('userInfo');
    },

    /**
     * 设置用户信息
     */
    setUserInfo(userInfo) {
        this.set('userInfo', userInfo);
    },

    /**
     * 获取当前班级ID
     */
    getCurrentClassId() {
        return this.get('currentClassId');
    },

    /**
     * 设置当前班级ID
     */
    setCurrentClassId(classId) {
        this.set('currentClassId', classId);
    },

    /**
     * 获取当前班级角色（来自 class_members.roleInClass）
     */
    getRoleInClass() {
        return this.get('roleInClass');
    },

    /**
     * 设置当前班级角色
     */
    setRoleInClass(role) {
        this.set('roleInClass', role);
    },

    /**
     * 清除登录信息
     */
    clearAuth() {
        this.remove('userInfo');
        this.remove('currentClassId');
        this.remove('roleInClass');
    }
};

module.exports = storage;

