// pages/student/feedback/feedback.js
const storage = require('../../../utils/storage');

Page({
  data: {},
  onLoad() {},
  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});

