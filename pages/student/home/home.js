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
    status: { checkedIn: false, submittedTaskIds: [] },
    loading: false,
    isDemo: false,
    greetingText: '',
    className: ''
  },

  onLoad() {
    const currentClassId = storage.getCurrentClassId();
    const userInfo = storage.getUserInfo() || {};
    const displayName = userInfo.name || userInfo.nickname || '同学';
    this.setData({
      isDemo: currentClassId === 'demo-class-id',
      greetingText: `${displayName}，${getTimeGreeting()}！`,
      className: storage.getCurrentClassName() || '',
      currentDate: format.formatDate(new Date(), 'YYYY-MM-DD')
    });
  },

  onShow() {
    this.loadTodayInfo();
  },

  async loadTodayInfo() {
    if (this.data.isDemo) {
      this.setData({ dayNumber: 1 });
      return;
    }
    const classId = storage.getCurrentClassId();
    if (!classId) return;
    this.setData({ loading: true });
    try {
      const result = await studentService.getTodayPlan({ classId });
      if (result && result.errCode === 0) {
        this.setData({
          dayNumber: result.dayNumber || 1,
          status: result.status || { checkedIn: false, submittedTaskIds: [] },
          className: result.className || storage.getCurrentClassName() || ''
        });
      }
    } catch (e) {
      // silent fail — home page info is non-critical
    } finally {
      this.setData({ loading: false });
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
    this.loadTodayInfo();
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },

  onPullDownRefresh() {
    this.loadTodayInfo();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  }
});
