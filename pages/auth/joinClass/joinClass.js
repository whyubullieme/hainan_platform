// pages/auth/joinClass/joinClass.js
const authService = require('../../../services/auth');
const classService = require('../../../services/class');
const storage = require('../../../utils/storage');

Page({
  data: {
    name: '',
    inviteCode: '',
    needName: false,  // 首次使用需输入姓名
    loading: false
  },

  onLoad(options) {
    const userInfo = storage.getUserInfo();
    this.setData({
      needName: !userInfo
    });
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCode: e.detail.value });
  },

  async handleJoinClass() {
    const { name, inviteCode, needName } = this.data;

    if (!inviteCode || inviteCode.trim() === '') {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }

    // 首次使用需输入姓名
    if (needName) {
      const nameTrim = name && name.trim();
      if (!nameTrim) {
        wx.showToast({ title: '请先设置姓名', icon: 'none' });
        return;
      }
    }

    this.setData({ loading: true });

    try {
      let userInfo = storage.getUserInfo();

      // 首次使用：先创建/获取用户
      if (!userInfo) {
        const authResult = await authService.getOrCreateUser({
          name: (name || '').trim()
        });
        if (!authResult || authResult.errCode !== 0 || !authResult.user) {
          throw new Error(authResult?.errMsg || '创建账号失败');
        }
        storage.setUserInfo(authResult.user);
      }

      const result = await classService.joinByInviteCode({
        inviteCode: inviteCode.trim()
      });

      if (result && result.errCode === 0) {
        storage.setCurrentClassId(result.classId);
        storage.setRoleInClass(result.roleInClass);
        wx.showToast({ title: '加入成功', icon: 'success' });
        setTimeout(() => {
          const url = result.roleInClass === 'teacher'
            ? '/pages/teacher/dashboard/dashboard'
            : '/pages/student/home/home';
          wx.reLaunch({ url });
        }, 1200);
      } else {
        throw new Error(result?.errMsg || '加入班级失败');
      }
    } catch (error) {
      const msg = (error && (error.message || error.errMsg)) || '加入班级失败';
      console.error('加入班级失败:', error);
      wx.showToast({
        title: String(msg).slice(0, 30),
        icon: 'none',
        duration: 3000
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});
