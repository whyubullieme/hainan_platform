// pages/student/progress/progress.js
const storage = require('../../../utils/storage');
const studentService = require('../../../services/student');
const { buildPagination } = require('../../../utils/pagination');

const PAGE_SIZE = 7;

Page({
  data: {
    days: [],
    visibleDays: [],
    totalDays: 0,
    pageSize: PAGE_SIZE,
    currentPage: 1,
    totalPages: 1,
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
      this.setData({
        days: [],
        visibleDays: [],
        totalDays: 0,
        currentPage: 1,
        totalPages: 1
      });
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
        const pagination = buildPagination(days, 1, PAGE_SIZE);
        this.setData({
          days,
          visibleDays: pagination.pageItems,
          totalDays: res.totalDays || days.length,
          currentPage: pagination.currentPage,
          totalPages: pagination.totalPages,
          loading: false
        });
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({
        days: [],
        visibleDays: [],
        currentPage: 1,
        totalPages: 1,
        loading: false
      });
    }
  },

  prevPage() {
    const { currentPage } = this.data;
    if (currentPage <= 1) return;
    this.goToPage(currentPage - 1);
  },

  nextPage() {
    const { currentPage, totalPages } = this.data;
    if (currentPage >= totalPages) return;
    this.goToPage(currentPage + 1);
  },

  goToPage(page) {
    const { days, pageSize } = this.data;
    const pagination = buildPagination(days, page, pageSize);
    this.setData({
      visibleDays: pagination.pageItems,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages
    });
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
