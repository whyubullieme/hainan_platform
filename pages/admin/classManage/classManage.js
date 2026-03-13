// pages/admin/classManage/classManage.js
const storage = require('../../../utils/storage');
const adminService = require('../../../services/admin');
const format = require('../../../utils/format');
const { buildPagination } = require('../../../utils/pagination');

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

Page({
  data: {
    classes: [],
    // 班级列表分页
    classPageSize: 3,
    classCurrentPage: 1,
    classTotalPages: 1,
    visibleClasses: [],
    className: '',
    startDate: format.formatDate(new Date(), 'YYYY-MM-DD'),
    totalDays: 14,
    daysOptions: [],
    daysIndex: 13, // 14 天默认索引（从 1 开始到 90）
    minDate: '2020-01-01',
    loading: false,
    classId: '',
    studentInviteCode: '',
    teacherInviteCode: '',
    greetingText: ''
  },

  onLoad() {
    const userInfo = storage.getUserInfo() || {};
    const displayName = userInfo.name || userInfo.nickname || '管理员';
    this.setData({ greetingText: `${displayName}，${getTimeGreeting()}！` });
    this.initDaysOptions();
    this.loadClasses();
  },

  onShow() {
    this.loadClasses();
  },

  async loadClasses() {
    try {
      const res = await adminService.listClasses();
      if (res && res.errCode === 0) {
        const classes = res.classes || [];
        this.setData(
          { classes },
          () => this.applyClassPagination()
        );
      }
    } catch (e) {
      console.error('loadClasses:', e);
    }
  },

  initDaysOptions() {
    const min = 1;
    const max = 90;
    const options = [];
    for (let i = min; i <= max; i += 1) {
      options.push(i);
    }
    const defaultDays = this.data.totalDays || 14;
    const index = Math.min(Math.max(defaultDays, min), max) - 1;
    this.setData({
      daysOptions: options,
      daysIndex: index,
      totalDays: defaultDays
    });
  },

  onTotalDaysPickerChange(e) {
    const index = parseInt(e.detail.value, 10) || 0;
    const { daysOptions } = this.data;
    const safeIndex = Math.min(Math.max(index, 0), daysOptions.length - 1);
    const value = daysOptions[safeIndex] || 14;
    this.setData({
      daysIndex: safeIndex,
      totalDays: value
    });
  },

  applyClassPagination() {
    const { classes, classPageSize, classCurrentPage } = this.data;
    const pagination = buildPagination(classes, classCurrentPage, classPageSize);
    this.setData({
      visibleClasses: pagination.pageItems,
      classTotalPages: pagination.totalPages,
      classCurrentPage: pagination.currentPage
    });
  },

  goPrevClassPage() {
    const { classCurrentPage } = this.data;
    if (classCurrentPage <= 1) return;
    this.setData(
      { classCurrentPage: classCurrentPage - 1 },
      () => this.applyClassPagination()
    );
  },

  goNextClassPage() {
    const { classCurrentPage, classTotalPages } = this.data;
    if (classCurrentPage >= classTotalPages) return;
    this.setData(
      { classCurrentPage: classCurrentPage + 1 },
      () => this.applyClassPagination()
    );
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: `/pages/admin/classDetail/classDetail?id=${id}` });
    }
  },

  goToTaskManage() {
    wx.navigateTo({ url: '/pages/admin/taskManage/taskManage' });
  },

  goToNewClass() {
    const { classId } = this.data;
    if (classId) {
      wx.navigateTo({ url: `/pages/admin/classDetail/classDetail?id=${classId}` });
    }
  },

  onClassNameInput(e) {
    this.setData({ className: e.detail.value });
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  async handleCreate() {
    const { className, startDate, totalDays } = this.data;
    if (!className || !className.trim()) {
      wx.showToast({ title: '请输入班级名称', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await adminService.createClassAndInitTasks({
        className: className.trim(),
        startDate: startDate || format.formatDate(new Date(), 'YYYY-MM-DD'),
        totalDays: Math.max(1, Math.min(90, totalDays || 14))
      });
      if (result && result.errCode === 0) {
        this.setData({
          classId: result.classId || '',
          studentInviteCode: result.studentInviteCode || '',
          teacherInviteCode: result.teacherInviteCode || ''
        });
        wx.showToast({ title: '创建成功', icon: 'success' });
        this.loadClasses();
      } else {
        throw new Error(result?.errMsg || '创建失败');
      }
    } catch (error) {
      wx.showToast({ title: error.message || '创建失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyCode(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
