// pages/student/submission/submission.js
const storage = require('../../../utils/storage');
const format = require('../../../utils/format');
const studentService = require('../../../services/student');

Page({
  data: {
    taskItems: [],
    status: { checkedIn: false, submittedTaskIds: [] },
    dayNumber: 1,
    isDemo: false
  },

  onLoad() {
    this.setData({ isDemo: storage.getCurrentClassId() === 'demo-class-id' });
    this.loadData();
  },

  async loadData() {
    if (this.data.isDemo) {
      this.setData({
        taskItems: [
          { taskItemId: 'demo1', title: '入住场景对话练习', submitted: false },
          { taskItemId: 'demo2', title: '电话预订练习', submitted: false },
          { taskItemId: 'demo3', title: '退房场景对话', submitted: false }
        ]
      });
      return;
    }
    const classId = storage.getCurrentClassId();
    if (!classId) return;
    try {
      const result = await studentService.getTodayPlan({ classId });
      if (result && result.errCode === 0) {
        const taskItems = (result.taskItems || []).map(t => ({
          ...t,
          submitted: (result.status?.submittedTaskIds || []).includes(t.taskItemId)
        }));
        this.setData({
          taskItems,
          dayNumber: result.dayNumber,
          status: result.status || {}
        });
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  async handleSubmit(e) {
    const taskId = e.currentTarget.dataset.taskId;
    const classId = storage.getCurrentClassId();
    if (!classId || !taskId) return;
    try {
      const result = await studentService.markSubmit({
        classId,
        dayNumber: this.data.dayNumber,
        taskItemId: taskId
      });
      if (result && result.errCode === 0) {
        wx.showToast({ title: '已记录', icon: 'success' });
        const taskItems = this.data.taskItems.map(t =>
          t.taskItemId === taskId ? { ...t, submitted: true } : t
        );
        this.setData({ taskItems });
      } else throw new Error(result?.errMsg);
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
