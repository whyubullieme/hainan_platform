// pages/teacher/students/students.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');

Page({
  data: {
    classId: '',
    status: 'missing',
    dayNumber: 1,
    students: [],
    loading: false,
    error: '',
    tabs: [
      { key: 'missing', label: '未提交' },
      { key: 'done', label: '待点评' },
      { key: 'reviewed', label: '已点评' },
    ],
  },
  onLoad(options = {}) {
    const allowedStatus = ['missing', 'done', 'reviewed'];
    const status = allowedStatus.includes(options.status) ? options.status : 'missing';
    const dayNumber = Number(options.dayNumber) || 1;
    this.setData({ status, dayNumber });
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
      this.fetchStudents();
    });
  },
  async fetchStudents() {
    const { classId, status, dayNumber } = this.data;
    if (!classId) {
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const result = await teacherService.listStudentsByStatus({ classId, status, dayNumber });
      this.setData({ students: result.students || [] });
    } catch (error) {
      console.error('fetchStudents error', error);
      this.setData({ error: error.message || '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  handleTabChange(e) {
    const { status } = e.currentTarget.dataset;
    if (status === this.data.status) {
      return;
    }
    this.setData({ status }, () => {
      this.fetchStudents();
    });
  },
  handleRefresh() {
    this.fetchStudents();
  },
  handleGoReview(e) {
    const { studentId, name } = e.currentTarget.dataset;
    const { dayNumber } = this.data;
    wx.navigateTo({
      url: `/pages/teacher/review/review?studentId=${studentId}&name=${encodeURIComponent(name || '')}&dayNumber=${dayNumber}`
    });
  },
  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
