// pages/student/progress/progress.js
const storage = require('../../../utils/storage');
const studentService = require('../../../services/student');

Page({
  data: {
    days: [],
    totalDays: 0,
    loading: false,
    isDemo: false
  },

  onLoad() {
    this.setData({ isDemo: storage.getCurrentClassId() === 'demo-class-id' });
    this.loadProgress();
  },

  onShow() {
    this.loadProgress();
  },

  async loadProgress() {
    const classId = storage.getCurrentClassId();
    if (!classId || this.data.isDemo) {
      this.setData({ days: [], totalDays: 0 });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await studentService.getFullPlan({ classId });
      if (res && res.errCode === 0) {
        const days = (res.days || []).map(d => {
          const taskCount = (d.tasks || []).length;
          const submittedCount = (d.submittedTaskIds || []).length;
          const allSubmitted = taskCount === 0 || submittedCount >= taskCount;
          const completed = d.checkedIn && allSubmitted;
          return {
            ...d,
            taskCount,
            submittedCount,
            allSubmitted,
            completed
          };
        });
        this.setData({
          days,
          totalDays: res.totalDays || days.length,
          loading: false
        });
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ days: [], loading: false });
    }
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
