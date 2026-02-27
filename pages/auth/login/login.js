// pages/auth/login/login.js
const authService = require('../../../services/auth');
const storage = require('../../../utils/storage');

Page({
  data: {
    loading: false,
    showAdminForm: false,
    adminPassword: '',
    adminName: ''
  },

  onLoad(options) {
    const userInfo = storage.getUserInfo();
    if (userInfo && this.shouldRedirect(userInfo)) {
      this.redirectToHome(userInfo);
    }
  },

  handleEnter() {
    const userInfo = storage.getUserInfo();
    if (userInfo && this.shouldRedirect(userInfo)) {
      this.redirectToHome(userInfo);
      return;
    }

    this.setData({ loading: true });
    wx.reLaunch({
      url: '/pages/auth/joinClass/joinClass',
      complete: () => this.setData({ loading: false })
    });
  },

  showAdminForm() {
    this.setData({ showAdminForm: true, adminPassword: '', adminName: '' });
  },

  hideAdminForm() {
    this.setData({ showAdminForm: false });
  },

  onAdminPasswordInput(e) {
    this.setData({ adminPassword: e.detail.value });
  },

  onAdminNameInput(e) {
    this.setData({ adminName: e.detail.value });
  },

  async handleAdminLogin() {
    const { adminPassword, adminName } = this.data;

    if (!adminPassword || !adminPassword.trim()) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    const userInfo = storage.getUserInfo();
    const nameTrim = adminName && adminName.trim();
    if (!userInfo && !nameTrim) {
      wx.showToast({ title: '首次使用请设置姓名', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await authService.adminLogin({
        password: adminPassword.trim(),
        name: nameTrim || undefined
      });

      if (result && result.errCode === 0 && result.user) {
        storage.setUserInfo(result.user);
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/admin/classManage/classManage' });
        }, 800);
      } else {
        throw new Error(result?.errMsg || '登录失败');
      }
    } catch (error) {
      const msg = (error && (error.message || error.errMsg)) || '登录失败';
      wx.showToast({ title: String(msg).slice(0, 30), icon: 'none', duration: 2500 });
    } finally {
      this.setData({ loading: false });
    }
  },

  shouldRedirect(userInfo) {
    if (userInfo.role === 'admin') return true;
    return !!storage.getCurrentClassId();
  },

  redirectToHome(userInfo) {
    let url = '/pages/student/home/home';
    if (userInfo.role === 'admin') {
      url = '/pages/admin/classManage/classManage';
    } else if (storage.getRoleInClass() === 'teacher') {
      url = '/pages/teacher/dashboard/dashboard';
    }
    wx.reLaunch({ url });
  }
});
