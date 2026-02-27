// pages/teacher/dashboard/dashboard.js
const storage = require('../../../utils/storage');

Page({
  data: {},
  onLoad() {},
  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },
  handleLogin() { wx.reLaunch({ url: '/pages/auth/login/login' }); },
  handleQuickAccess() { wx.reLaunch({ url: '/pages/auth/login/login' }); }
});

