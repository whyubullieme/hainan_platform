// pages/teacher/dashboard/dashboard.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');

Page({
  data: {
    classId: '',
    dayNumber: 1,
    overview: null,
    loading: false,
    error: '',
  },
  onShow() {
    this.bootstrap();
  },
  bootstrap() {
    const classId = storage.getCurrentClassId();
    if (!classId) {
      this.setData({ error: '请先加入班级', classId: '' });
      return;
    }
    this.setData({ classId }, () => {
      this.loadOverview();
    });
  },
  async loadOverview() {
    const { classId, dayNumber } = this.data;
    if (!classId) {
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const result = await teacherService.getOverview({ classId, dayNumber });
      this.setData({
        overview: result,
        dayNumber: result.dayNumber || dayNumber,
      });
    } catch (error) {
      console.error('loadOverview error', error);
      this.setData({ error: error.message || '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },
  handleDayNumberInput(e) {
    const value = Number(e.detail.value);
    this.setData({ dayNumber: Number.isNaN(value) || value < 1 ? 1 : value });
  },
  handleRefresh() {
    this.loadOverview();
  },
  handleViewMissing() {
    const { dayNumber } = this.data;
    wx.navigateTo({ url: `/pages/teacher/students/students?status=missing&dayNumber=${dayNumber}` });
  },
  handleViewDone() {
    const { dayNumber } = this.data;
    wx.navigateTo({ url: `/pages/teacher/students/students?status=done&dayNumber=${dayNumber}` });
  }
});
