// pages/admin/classDetail/classDetail.js
const adminService = require('../../../services/admin');

Page({
  data: {
    classId: '',
    cls: null,
    members: [],
    loading: false,
    editing: false,
    editName: '',
    editStartDate: '',
    editTotalDays: 14,
    userKeyword: '',
    userSearchResult: []
  },

  handleLogout() {
    const storage = require('../../../utils/storage');
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  },

  onLoad(options) {
    const classId = options.id || options.classId;
    if (!classId) {
      wx.showToast({ title: '缺少班级ID', icon: 'none' });
      return;
    }
    this.setData({ classId });
    this.loadDetail();
  },

  onShow() {
    if (this.data.classId) this.loadDetail();
  },

  async loadDetail() {
    const { classId } = this.data;
    this.setData({ loading: true });
    try {
      const res = await adminService.getClassDetail({ classId });
      if (res && res.errCode === 0) {
        this.setData({
          cls: res.class,
          members: res.members || [],
          editName: res.class.name,
          editStartDate: res.class.startDate || '',
          editTotalDays: res.class.totalDays || 14
        });
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onNameInput(e) {
    this.setData({ editName: e.detail.value });
  },

  onStartDateChange(e) {
    this.setData({ editStartDate: e.detail.value });
  },

  onTotalDaysChange(e) {
    const v = e.detail.value;
    const n = parseInt(v, 10);
    this.setData({
      editTotalDays: (v === '' || isNaN(n)) ? 14 : Math.min(90, Math.max(1, n))
    });
  },

  toggleEdit() {
    const { cls } = this.data;
    this.setData({
      editing: true,
      editName: cls.name || '',
      editStartDate: cls.startDate || '',
      editTotalDays: cls.totalDays || 14
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  async saveClass() {
    const { classId, editName, editStartDate, editTotalDays } = this.data;
    if (!editName || !editName.trim()) {
      wx.showToast({ title: '请输入班级名称', icon: 'none' });
      return;
    }
    const totalDays = Math.max(1, Math.min(90, parseInt(editTotalDays, 10) || 14));
    this.setData({ loading: true });
    try {
      const res = await adminService.updateClass({
        classId,
        name: editName.trim(),
        startDate: editStartDate,
        totalDays
      });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ editing: false });
        this.loadDetail();
      } else {
        throw new Error(res?.errMsg || '保存失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  confirmDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除班级将同时移除所有成员，且不可恢复。确定删除？',
      success: (r) => {
        if (r.confirm) this.doDelete();
      }
    });
  },

  async doDelete() {
    const { classId } = this.data;
    this.setData({ loading: true });
    try {
      const res = await adminService.deleteClass({ classId });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        throw new Error(res?.errMsg || '删除失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '删除失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyCode(e) {
    const code = e.currentTarget.dataset.code;
    if (code) {
      wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
    }
  },

  onUserKeywordInput(e) {
    this.setData({ userKeyword: e.detail.value });
  },

  async searchUsers() {
    const keyword = this.data.userKeyword.trim();
    this.setData({ loading: true });
    try {
      const res = await adminService.listUsers({ keyword: keyword || undefined, limit: 20 });
      if (res && res.errCode === 0) {
        this.setData({ userSearchResult: res.users || [] });
      } else {
        throw new Error(res?.errMsg || '搜索失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '搜索失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async addMemberAs(e) {
    const userId = e.currentTarget.dataset.userId;
    const role = e.currentTarget.dataset.role;
    const { classId } = this.data;
    if (!userId) return;
    this.setData({ loading: true });
    try {
      const res = await adminService.addMember({ classId, userId, roleInClass: role });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '添加成功', icon: 'success' });
        this.setData({ userSearchResult: [], userKeyword: '' });
        this.loadDetail();
      } else {
        throw new Error(res?.errMsg || '添加失败');
      }
    } catch (err) {
      wx.showToast({ title: err.message || '添加失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async changeRole(e) {
    const memberId = e.currentTarget.dataset.memberId;
    const newRole = e.currentTarget.dataset.role;
    const { classId } = this.data;
    if (!memberId) return;
    this.setData({ loading: true });
    try {
      const res = await adminService.updateMemberRole({
        classId,
        memberId,
        roleInClass: newRole
      });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '已更新', icon: 'success' });
        this.loadDetail();
      } else {
        throw new Error(res?.errMsg || '更新失败');
      }
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  removeMember(e) {
    const memberId = e.currentTarget.dataset.memberId;
    const memberName = e.currentTarget.dataset.memberName || '该成员';
    if (!memberId) return;
    wx.showModal({
      title: '确认移出',
      content: `确定将「${memberName}」移出班级？`,
      success: (r) => {
        if (r.confirm) this.doRemoveMember(memberId);
      }
    });
  },

  async doRemoveMember(memberId) {
    const { classId } = this.data;
    this.setData({ loading: true });
    try {
      const res = await adminService.removeMember({ classId, memberId });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '已移出', icon: 'success' });
        this.loadDetail();
      } else {
        throw new Error(res?.errMsg || '移除失败');
      }
    } catch (err) {
      wx.showToast({ title: err.message || '移除失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
