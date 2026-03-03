// pages/teacher/dashboard/dashboard.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');

Page({
  data: {
    classId: '',
    dayNumber: 1,
    date: '',
    overview: null,
    missingCount: 0,
    loading: false,
    addingTasks: false,
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    this.setData({ classId, date: todayStr }, () => {
      this.loadOverview();
    });
  },
  async loadOverview() {
    const { classId, date, dayNumber } = this.data;
    if (!classId) {
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const params = { classId };
      if (date) {
        params.date = date;
      } else {
        params.dayNumber = dayNumber;
      }
      const result = await teacherService.getOverview(params);
      const total = result.totalStudents || 0;
      const checked = result.checkedInCount || 0;
      const submitted = result.submittedCount || 0;
      const missing = Math.max(0, total - Math.min(checked, submitted));
      this.setData({
        overview: result,
        dayNumber: result.dayNumber || dayNumber,
        missingCount: missing,
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
  handleDateChange(e) {
    const value = e.detail.value;
    this.setData({ date: value }, () => {
      this.loadOverview();
    });
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
  },
  async handleAddDayTasks() {
    const { classId } = this.data;
    if (!classId) return;
    this.setData({ addingTasks: true });
    try {
      const res = await teacherService.addDayTasks({ classId });
      if (res && res.errCode === 0) {
        wx.showToast({ title: `已添加第${res.dayNumber}天任务`, icon: 'success' });
      } else {
        throw new Error(res?.errMsg || '添加失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '添加失败', icon: 'none' });
    } finally {
      this.setData({ addingTasks: false });
    }
  }
});
