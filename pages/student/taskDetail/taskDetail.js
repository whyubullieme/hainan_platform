// pages/student/taskDetail/taskDetail.js
const storage = require('../../../utils/storage');
const studentService = require('../../../services/student');

Page({
  data: {
    taskId: '',
    task: null,
    loading: true,
    submitting: false,
    submitted: false,
    isDemo: false
  },

  onLoad(options) {
    const taskId = options.taskId;
    const isDemo = storage.getCurrentClassId() === 'demo-class-id';
    this.setData({ taskId, isDemo });
    if (taskId && !isDemo) {
      this.loadTask();
    } else if (isDemo) {
      this.setDemoTask();
    } else {
      this.setData({ loading: false });
    }
  },

  async loadTask() {
    const { taskId } = this.data;
    this.setData({ loading: true });
    try {
      const res = await studentService.getTaskDetail({ taskId });
      if (res && res.errCode === 0 && res.taskItem) {
        const t = res.taskItem;
        const submitted = await this.checkSubmitted(t.taskItemId, t.dayNumber);
        this.setData({
          task: t,
          submitted,
          loading: false
        });
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async checkSubmitted(taskItemId, dayNumber) {
    const classId = storage.getCurrentClassId();
    if (!classId) return false;
    try {
      const res = await studentService.getMySubmissions({ classId });
      if (res && res.errCode === 0 && res.records) {
        return res.records.some(r => String(r.taskItemId) === String(taskItemId) && r.dayNumber === dayNumber);
      }
    } catch (_) {}
    return false;
  },

  setDemoTask() {
    this.setData({
      task: {
        taskItemId: 'demo1',
        title: '入住场景对话练习',
        content: '跟随音频练习酒店入住英语对话',
        taskType: 'read_along',
        dayNumber: 1
      },
      submitted: false,
      loading: false
    });
  },

  async handleMarkSubmit() {
    const { task, isDemo } = this.data;
    if (!task || isDemo) return;
    const classId = storage.getCurrentClassId();
    if (!classId) {
      wx.showToast({ title: '请先加入班级', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const res = await studentService.markSubmit({
        classId,
        dayNumber: task.dayNumber,
        taskItemId: task.taskItemId
      });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '已记录', icon: 'success' });
        this.setData({ submitted: true });
      } else {
        throw new Error(res?.errMsg || '操作失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
