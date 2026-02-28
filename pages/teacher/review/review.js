// pages/teacher/review/review.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');

Page({
  data: {
    classId: '',
    studentId: '',
    studentName: '',
    dayNumber: 1,
    comment: '',
    saving: false,
    error: ''
  },
  onLoad(options = {}) {
    const studentName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({
      studentId: options.studentId || '',
      studentName,
      dayNumber: Number(options.dayNumber) || 1,
    });
  },
  onShow() {
    const classId = storage.getCurrentClassId();
    if (!classId) {
      this.setData({ error: '缺少班级信息', classId: '' });
      return;
    }
    this.setData({ classId });
  },
  handleCommentInput(e) {
    this.setData({ comment: e.detail.value });
  },
  async handleSave() {
    const { classId, studentId, dayNumber, comment } = this.data;
    if (!classId) {
      this.setData({ error: '缺少班级信息' });
      return;
    }
    if (!studentId) {
      this.setData({ error: '缺少学生信息' });
      return;
    }
    if (!comment || !comment.trim()) {
      wx.showToast({ title: '请输入点评内容', icon: 'none' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await teacherService.saveReview({ classId, studentId, dayNumber, comment: comment.trim() });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 600);
    } catch (error) {
      console.error('saveReview error', error);
      this.setData({ error: error.message || '保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },
  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
