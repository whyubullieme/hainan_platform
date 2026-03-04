// pages/teacher/review/review.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');

Page({
  data: {
    classId: '',
    studentId: '',
    studentName: '',
    dayNumber: 1,
    submissions: [],
    loadingSubmissions: false,
    playingSubmissionId: '',
    dayTaskCount: 0,
    submittedTaskCount: 0,
    allTaskDone: false,
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
    this.setData({ classId }, () => {
      this.loadStudentSubmissions();
    });
  },
  async loadStudentSubmissions() {
    const { classId, studentId, dayNumber } = this.data;
    if (!classId || !studentId || !dayNumber) return;
    this.setData({ loadingSubmissions: true });
    try {
      const res = await teacherService.getStudentSubmissions({ classId, studentId, dayNumber });
      if (!res || res.errCode !== 0) {
        throw new Error(res?.errMsg || '获取学生提交失败');
      }
      const dayTaskCount = Number(res.dayTaskCount) || 0;
      const submittedTaskCount = Number(res.submittedTaskCount) || 0;
      this.setData({
        submissions: res.items || [],
        dayTaskCount,
        submittedTaskCount,
        allTaskDone: !!res.allTaskDone
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载提交失败', icon: 'none' });
      this.setData({
        submissions: [],
        dayTaskCount: 0,
        submittedTaskCount: 0,
        allTaskDone: false
      });
    } finally {
      this.setData({ loadingSubmissions: false });
    }
  },

  playSubmissionAudio(e) {
    const { url, sid } = e.currentTarget.dataset || {};
    if (!url) {
      wx.showToast({ title: '音频地址无效', icon: 'none' });
      return;
    }
    try {
      if (!this.previewAudioContext) {
        this.previewAudioContext = wx.createInnerAudioContext();
        this.previewAudioContext.onEnded(() => {
          this.setData({ playingSubmissionId: '' });
        });
        this.previewAudioContext.onStop(() => {
          this.setData({ playingSubmissionId: '' });
        });
        this.previewAudioContext.onError(() => {
          this.setData({ playingSubmissionId: '' });
          wx.showToast({ title: '播放失败', icon: 'none' });
        });
      }
      this.previewAudioContext.src = url;
      this.previewAudioContext.play();
      this.setData({ playingSubmissionId: sid || '' });
    } catch (err) {
      wx.showToast({ title: '播放失败', icon: 'none' });
    }
  },

  stopSubmissionAudio() {
    if (this.previewAudioContext) {
      this.previewAudioContext.stop();
    }
    this.setData({ playingSubmissionId: '' });
  },
  handleCommentInput(e) {
    this.setData({ comment: e.detail.value });
  },
  async handleSave() {
    const { classId, studentId, dayNumber, comment, allTaskDone, dayTaskCount, submittedTaskCount } = this.data;
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
    if (!allTaskDone) {
      wx.showToast({
        title: `任务未完成（${submittedTaskCount}/${dayTaskCount}）`,
        icon: 'none'
      });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await teacherService.saveReview({ classId, studentId, dayNumber, comment: comment.trim() });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/teacher/students/students?status=reviewed&dayNumber=${dayNumber}` });
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
  },
  onUnload() {
    if (this.previewAudioContext) {
      try {
        this.previewAudioContext.destroy();
      } catch (e) {}
      this.previewAudioContext = null;
    }
  }
});
