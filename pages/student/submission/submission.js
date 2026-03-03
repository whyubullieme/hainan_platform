// pages/student/submission/submission.js
const storage = require('../../../utils/storage');
const format = require('../../../utils/format');
const studentService = require('../../../services/student');

Page({
  data: {
    records: [],
    groupedRecords: [],
    selectedDate: '',
    filterMode: 'all', // 'all' | 'date'
    startDate: '2020-01-01',
    endDate: '',
    isDemo: false
  },

  onLoad() {
    const classId = storage.getCurrentClassId();
    this.setData({ isDemo: classId === 'demo-class-id' });
    const today = format.formatDate(new Date(), 'YYYY-MM-DD');
    this.setData({
      selectedDate: today,
      startDate: '2020-01-01',
      endDate: today
    });
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  onDateChange(e) {
    const date = e.detail.value;
    this.setData({ selectedDate: date, filterMode: 'date' }, () => this.loadData());
  },

  setFilterMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ filterMode: mode }, () => this.loadData());
  },

  async loadData() {
    const classId = storage.getCurrentClassId();
    if (!classId || this.data.isDemo) {
      this.setData({ records: [], groupedRecords: [] });
      return;
    }

    try {
      const params = { classId };
      if (this.data.filterMode === 'date' && this.data.selectedDate) {
        params.date = this.data.selectedDate;
      }
      const res = await studentService.getMySubmissions(params);
      if (res && res.errCode === 0) {
        const records = res.records || [];
        const today = format.formatDate(new Date(), 'YYYY-MM-DD');
        if (res.startDate) {
          this.setData({
            startDate: res.startDate,
            endDate: today
          });
        }
        const grouped = this.groupByDate(records);
        this.setData({ records, groupedRecords: grouped });
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ records: [], groupedRecords: [] });
    }
  },

  groupByDate(records) {
    const map = {};
    records.forEach(r => {
      const key = r.dateStr;
      if (!map[key]) map[key] = { dateStr: r.dateStr, dayNumber: r.dayNumber, items: [] };
      map[key].items.push(r);
    });
    return Object.values(map).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
