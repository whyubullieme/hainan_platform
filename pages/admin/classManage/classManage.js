// pages/admin/classManage/classManage.js
const storage = require('../../../utils/storage');
const adminService = require('../../../services/admin');
const format = require('../../../utils/format');

Page({
  data: {
    classes: [],
    className: '',
    startDate: format.formatDate(new Date(), 'YYYY-MM-DD'),
    totalDays: 14,
    minDate: '2020-01-01',
    loading: false,
    classId: '',
    studentInviteCode: '',
    teacherInviteCode: ''
  },

  onLoad() {
    this.loadClasses();
  },

  onShow() {
    this.loadClasses();
  },

  async loadClasses() {
    try {
      const res = await adminService.listClasses();
      if (res && res.errCode === 0) {
        this.setData({ classes: res.classes || [] });
      }
    } catch (e) {
      console.error('loadClasses:', e);
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: `/pages/admin/classDetail/classDetail?id=${id}` });
    }
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

  onTotalDaysChange(e) {
    const v = e.detail.value;
    const n = parseInt(v, 10);
    this.setData({
      totalDays: (v === '' || isNaN(n)) ? 14 : Math.min(90, Math.max(1, n))
    });
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
        totalDays: Math.max(1, Math.min(90, totalDays || 14)),
        teacherUserIds: [],
        tasks: []
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
