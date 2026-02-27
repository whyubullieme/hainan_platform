// pages/admin/classManage/classManage.js
const storage = require('../../../utils/storage');
const adminService = require('../../../services/admin');
const format = require('../../../utils/format');

Page({
  data: {
    className: '',
    startDate: format.formatDate(new Date(), 'YYYY-MM-DD'),
    minDate: '2020-01-01',
    loading: false,
    classId: '',
    studentInviteCode: '',
    teacherInviteCode: ''
  },

  onLoad() {},

  onClassNameInput(e) {
    this.setData({ className: e.detail.value });
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  async handleCreate() {
    const { className, startDate } = this.data;
    if (!className || !className.trim()) {
      wx.showToast({ title: '请输入班级名称', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await adminService.createClassAndInitTasks({
        className: className.trim(),
        startDate: startDate || format.formatDate(new Date(), 'YYYY-MM-DD'),
        teacherUserIds: [],
        tasks: [
          { dayNumber: 1, items: [
            { title: '入住场景对话练习', content: '练习酒店入住英语对话', order: 1 },
            { title: '电话预订练习', content: '练习电话预订客房', order: 2 },
            { title: '退房场景对话', content: '练习退房流程对话', order: 3 }
          ]},
          { dayNumber: 2, items: [
            { title: '投诉处理对话', content: '处理客户投诉场景', order: 1 },
            { title: '海南旅游咨询', content: '介绍海南景点', order: 2 }
          ]},
          { dayNumber: 3, items: [
            { title: '政策说明', content: '入住政策说明', order: 1 }
          ]},
          { dayNumber: 4, items: [
            { title: '综合练习1', content: '', order: 1 }
          ]},
          { dayNumber: 5, items: [
            { title: '综合练习2', content: '', order: 1 }
          ]}
        ]
      });
      if (result && result.errCode === 0) {
        this.setData({
          classId: result.classId || '',
          studentInviteCode: result.studentInviteCode || '',
          teacherInviteCode: result.teacherInviteCode || ''
        });
        wx.showToast({ title: '创建成功', icon: 'success' });
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
