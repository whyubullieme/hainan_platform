// pages/student/home/home.js
const storage = require('../../../utils/storage');
const format = require('../../../utils/format');
const studentService = require('../../../services/student');

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

Page({
  data: {
    dayNumber: 1,
    currentDate: '',
    taskItems: [],
    status: { checkedIn: false, submittedTaskIds: [] },
    loading: false,
    isDemo: false,
    greetingText: '',
    className: ''
  },

  onLoad(options) {
    const currentClassId = storage.getCurrentClassId();
    const userInfo = storage.getUserInfo() || {};
    const displayName = userInfo.name || userInfo.nickname || '同学';
    this.setData({
      isDemo: currentClassId === 'demo-class-id',
      greetingText: `${displayName}，${getTimeGreeting()}！`,
      className: storage.getCurrentClassName() || ''
    });
  },

  onShow() {
    this.loadTodayPlan();
  },

  async loadTodayPlan() {
    this.setData({ loading: true });
    try {
      if (this.data.isDemo) {
        this.setDemoData();
      } else {
        const classId = storage.getCurrentClassId();
        if (!classId) {
          wx.showToast({ title: '请先加入班级', icon: 'none' });
          return;
        }
        const result = await studentService.getTodayPlan({ classId });
        if (result && result.errCode === 0) {
          const today = new Date();
          const taskItems = (result.taskItems || []).map(t => ({
            ...t,
            submitted: (result.status?.submittedTaskIds || []).includes(t.taskItemId)
          }));
          this.setData({
            dayNumber: result.dayNumber,
            currentDate: format.formatDate(today, 'YYYY-MM-DD'),
            taskItems,
            status: result.status || { checkedIn: false, submittedTaskIds: [] },
            className: result.className || storage.getCurrentClassName() || ''
          });
        } else {
          throw new Error(result?.errMsg || '加载失败');
        }
      }
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  setDemoData() {
    const today = new Date();
    this.setData({
      dayNumber: 1,
      currentDate: format.formatDate(today, 'YYYY-MM-DD'),
      taskItems: [
        { taskItemId: 'demo1', title: '入住场景对话练习', content: '', order: 1, submitted: false },
        { taskItemId: 'demo2', title: '电话预订练习', content: '', order: 2, submitted: false },
        { taskItemId: 'demo3', title: '退房场景对话', content: '', order: 3, submitted: false }
      ],
      status: { checkedIn: false, submittedTaskIds: [] }
    });
  },

  viewTaskDetail(e) {
    const taskId = e.currentTarget.dataset.taskId;
    wx.navigateTo({ url: `/pages/student/taskDetail/taskDetail?taskId=${taskId}` });
  },

  async handleCheckin() {
    const classId = storage.getCurrentClassId();
    if (!classId || this.data.isDemo) return;
    try {
      const result = await studentService.markCheckin({
        classId,
        dayNumber: this.data.dayNumber
      });
      if (result && result.errCode === 0) {
        wx.showToast({ title: '签到成功', icon: 'success' });
        this.setData({ 'status.checkedIn': true });
      } else throw new Error(result?.errMsg);
    } catch (error) {
      wx.showToast({ title: error.message || '签到失败', icon: 'none' });
    }
  },

  goToMyTasks() {
    wx.navigateTo({ url: '/pages/student/myTasks/myTasks' });
  },

  goToProgress() {
    wx.navigateTo({ url: '/pages/student/progress/progress' });
  },

  goToSubmission() {
    wx.navigateTo({ url: '/pages/student/submission/submission' });
  },

  goToFeedback() {
    wx.navigateTo({ url: '/pages/student/feedback/feedback' });
  },

  handleRefresh() {
    this.loadTodayPlan();
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },

  onPullDownRefresh() {
    this.loadTodayPlan();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  }
});
