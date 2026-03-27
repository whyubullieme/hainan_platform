// pages/teacher/topErrors/topErrors.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');

Page({
  data: {
    classId: '',
    loading: false,
    error: '',
    topTasks: [],
    topErrorWords: [],
    hasData: false,
  },
  onShow() {
    this.loadData();
  },
  async loadData() {
    const classId = storage.getCurrentClassId();
    if (!classId) {
      this.setData({ error: '请先加入班级', classId: '' });
      return;
    }
    this.setData({ classId, loading: true, error: '' });
    try {
      const result = await teacherService.getTopErrors({ classId });
      if (result.errCode !== 0) {
        this.setData({ error: result.errMsg || '加载失败' });
        return;
      }
      const topTasks = result.topTasks || [];
      const topErrorWords = result.topErrorWords || [];
      this.setData({
        topTasks,
        topErrorWords,
        hasData: topTasks.length > 0 || topErrorWords.length > 0,
      });
    } catch (error) {
      console.error('topErrors loadData error', error);
      this.setData({ error: error.message || '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },
});
