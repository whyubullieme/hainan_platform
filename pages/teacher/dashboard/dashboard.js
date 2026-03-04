// pages/teacher/dashboard/dashboard.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

Page({
  data: {
    classId: '',
    dayNumber: 1,
    date: '',
    overview: null,
    missingCount: 0,
    pendingReviewCount: 0,
    loading: false,
    error: '',
    taskActionDate: '',
    greetingText: ''
  },
  onShow() {
    this.bootstrap();
  },
  bootstrap() {
    const classId = storage.getCurrentClassId();
    const userInfo = storage.getUserInfo() || {};
    const displayName = userInfo.name || userInfo.nickname || '老师';
    if (!classId) {
      this.setData({ error: '请先加入班级', classId: '' });
      return;
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    this.setData({
      classId,
      date: todayStr,
      taskActionDate: todayStr,
      greetingText: `${displayName}，${getTimeGreeting()}！`
    }, () => {
      this.loadOverview();
    });
  },
  async loadOverview() {
    const { classId, date, dayNumber } = this.data;
    if (!classId) {
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const params = { classId };
      if (date) {
        params.date = date;
      } else {
        params.dayNumber = dayNumber;
      }
      const result = await teacherService.getOverview(params);
      const total = result.totalStudents || 0;
      const submitted = result.submittedCount || 0;
      const reviewed = result.reviewedCount || 0;
      // 当前版本完成度只按“提交作业”统计，不受签到开关影响
      const missing = Math.max(0, total - submitted);
      const pendingReview = Math.max(0, submitted - reviewed);
      this.setData({
        overview: result,
        dayNumber: result.dayNumber || dayNumber,
        missingCount: missing,
        pendingReviewCount: pendingReview,
      });
    } catch (error) {
      console.error('loadOverview error', error);
      this.setData({ error: error.message || '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },
  handleDateChange(e) {
    const value = e.detail.value;
    this.setData({ date: value }, () => {
      this.loadOverview();
    });
  },
  handleRefresh() {
    this.loadOverview();
  },
  handleViewMissing() {
    const { dayNumber } = this.data;
    wx.navigateTo({ url: `/pages/teacher/students/students?status=missing&dayNumber=${dayNumber}` });
  },
  handleViewDone() {
    const { dayNumber } = this.data;
    wx.navigateTo({ url: `/pages/teacher/students/students?status=done&dayNumber=${dayNumber}` });
  },
  handleViewReviewed() {
    const { dayNumber } = this.data;
    wx.navigateTo({ url: `/pages/teacher/students/students?status=reviewed&dayNumber=${dayNumber}` });
  },
  handleAddDayTasks() {
    const { classId, taskActionDate } = this.data;
    if (!classId || !taskActionDate) return;
    wx.navigateTo({ url: `/pages/teacher/addTask/addTask?date=${encodeURIComponent(taskActionDate)}` });
  },

  handleTaskActionDateChange(e) {
    const value = e.detail.value;
    this.setData({ taskActionDate: value });
  },

  handleRevokeDayTasks() {
    const { classId, taskActionDate } = this.data;
    if (!classId || !taskActionDate) return;
    wx.showModal({
      title: '撤销指定日期任务',
      content: `确定撤销 ${taskActionDate} 的全部任务吗？学生将看不到这一天的任务。`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '撤销中...', mask: true });
          const result = await teacherService.revokeDayTasks({ classId, date: taskActionDate });
          wx.hideLoading();
          if (result.errCode !== 0) {
            wx.showToast({ title: result.errMsg || '撤销失败', icon: 'none' });
            return;
          }
          const dayLabel = result.dayNumber ? `第${result.dayNumber}天` : taskActionDate;
          wx.showToast({ title: `已撤销${dayLabel}任务`, icon: 'success' });
          this.loadOverview();
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: e.message || '撤销失败', icon: 'none' });
        }
      },
    });
  }
});
