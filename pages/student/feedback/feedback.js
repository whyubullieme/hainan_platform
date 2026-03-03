// pages/student/feedback/feedback.js
const storage = require('../../../utils/storage');
const format = require('../../../utils/format');
const studentService = require('../../../services/student');

Page({
  data: {
    reviews: [],
    isDemo: false
  },

  onLoad() {
    this.setData({ isDemo: storage.getCurrentClassId() === 'demo-class-id' });
    this.loadReviews();
  },

  onShow() {
    this.loadReviews();
  },

  async loadReviews() {
    const classId = storage.getCurrentClassId();
    if (!classId || this.data.isDemo) {
      this.setData({ reviews: [] });
      return;
    }

    try {
      const res = await studentService.getMyReviews({ classId });
      if (res && res.errCode === 0) {
        this.setData({ reviews: res.reviews || [] });
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ reviews: [] });
    }
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
