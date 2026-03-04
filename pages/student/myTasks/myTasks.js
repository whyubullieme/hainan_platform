// pages/student/myTasks/myTasks.js
const storage = require('../../../utils/storage');
const studentService = require('../../../services/student');
const { buildPagination } = require('../../../utils/pagination');

const PAGE_SIZE = 7;

Page({
  data: {
    days: [],
    totalDays: 0,
    displayedDays: [],
    currentPage: 1,
    totalPages: 1,
    loading: false,
    isDemo: false
  },

  onLoad() {
    this.setData({ isDemo: storage.getCurrentClassId() === 'demo-class-id' });
    this.loadPlan();
  },

  onShow() {
    this.loadPlan();
  },

  async loadPlan() {
    const classId = storage.getCurrentClassId();
    if (!classId || this.data.isDemo) {
      this.setData({ days: [] });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await studentService.getFullPlan({ classId });
      if (res && res.errCode === 0) {
        const days = res.days || [];
        const totalDays = res.totalDays || days.length || 14;
        const pagination = buildPagination(days, 1, PAGE_SIZE);
        this.setData({
          days,
          totalDays,
          displayedDays: pagination.pageItems,
          currentPage: pagination.currentPage,
          totalPages: pagination.totalPages
        });
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ days: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  prevPage() {
    const { currentPage } = this.data;
    if (currentPage <= 1) return;
    this._goToPage(currentPage - 1);
  },

  nextPage() {
    const { currentPage, totalPages } = this.data;
    if (currentPage >= totalPages) return;
    this._goToPage(currentPage + 1);
  },

  _goToPage(page) {
    const { days } = this.data;
    const pagination = buildPagination(days, page, PAGE_SIZE);
    this.setData({
      currentPage: pagination.currentPage,
      displayedDays: pagination.pageItems,
      totalPages: pagination.totalPages
    });
  },

  viewTaskDetail(e) {
    const taskId = e.currentTarget.dataset.taskId;
    if (taskId) {
      wx.navigateTo({ url: `/pages/student/taskDetail/taskDetail?taskId=${taskId}` });
    }
  },

  async handleSubmit(e) {
    const taskId = e.currentTarget.dataset.taskId;
    const dayNumber = e.currentTarget.dataset.day;
    const classId = storage.getCurrentClassId();
    if (!classId || !taskId || !dayNumber) return;

    try {
      const res = await studentService.markSubmit({
        classId,
        dayNumber: Number(dayNumber),
        taskItemId: taskId
      });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '已记录', icon: 'success' });
        this.loadPlan();
      } else {
        throw new Error(res?.errMsg || '操作失败');
      }
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
