// pages/teacher/addTask/addTask.js
const storage = require('../../../utils/storage');
const teacherService = require('../../../services/teacher');
const { buildPagination } = require('../../../utils/pagination');

Page({
  data: {
    classId: '',
    assignDate: '',
    tasks: [],
    // 当前可见任务（按类型和分页过滤后）
    visibleTasks: [],
    selectedIds: {},
    selectedCount: 0,
    loading: true,
    submitting: false,
    error: '',
    // 任务类型 Tabs，可扩展（例如后续加入 quiz）
    tabs: [
      { key: 'read_aloud', label: '朗读' },
      { key: 'read_along', label: '跟读' },
    ],
    activeTab: 'read_aloud',
    // 分页配置
    pageSize: 8,
    currentPage: 1,
    totalPages: 1,
  },

  onLoad(options = {}) {
    const classId = storage.getCurrentClassId();
    if (!classId) {
      wx.showToast({ title: '请先加入班级', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const assignDate = options.date || today;
    this.setData({ classId, assignDate }, () => this.loadTaskBank());
  },

  onAssignDateChange(e) {
    this.setData({ assignDate: e.detail.value });
  },

  async loadTaskBank() {
    this.setData({ loading: true, error: '' });
    try {
      const res = await teacherService.getTaskBank();
      if (res.errCode !== 0 || !res.tasks) {
        throw new Error(res.errMsg || '获取任务库失败');
      }
      this.setData(
        {
          tasks: res.tasks,
          loading: false,
        },
        () => {
          this.applyFilters();
        }
      );
    } catch (e) {
      this.setData({ error: e.message || '加载失败', loading: false });
    }
  },

  // 根据当前 tab 和分页计算可见任务
  applyFilters() {
    const { tasks, activeTab, pageSize, currentPage } = this.data;
    const normalizedTasks = tasks || [];

    const filtered =
      activeTab
        ? normalizedTasks.filter((t) => (t.taskType || 'read_aloud') === activeTab)
        : normalizedTasks;

    const pagination = buildPagination(filtered, currentPage, pageSize);

    this.setData({
      visibleTasks: pagination.pageItems,
      totalPages: pagination.totalPages,
      currentPage: pagination.currentPage,
    });
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData(
      {
        activeTab: key,
        currentPage: 1,
      },
      () => this.applyFilters()
    );
  },

  goPrevPage() {
    const { currentPage } = this.data;
    if (currentPage <= 1) return;
    this.setData(
      {
        currentPage: currentPage - 1,
      },
      () => this.applyFilters()
    );
  },

  goNextPage() {
    const { currentPage, totalPages } = this.data;
    if (currentPage >= totalPages) return;
    this.setData(
      {
        currentPage: currentPage + 1,
      },
      () => this.applyFilters()
    );
  },

  onTaskTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const selectedIds = { ...this.data.selectedIds };
    selectedIds[id] = !selectedIds[id];
    const selectedCount = Object.keys(selectedIds).filter((k) => selectedIds[k]).length;
    this.setData({ selectedIds, selectedCount });
  },

  async handleConfirm() {
    const { classId, tasks, selectedIds, assignDate } = this.data;
    const selected = tasks.filter((t) => selectedIds[t.id]);
    if (selected.length === 0) {
      wx.showToast({ title: '请至少选择一项任务', icon: 'none' });
      return;
    }
    if (!assignDate) {
      wx.showToast({ title: '请选择添加日期', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const payload = {
        classId,
        date: assignDate,
        tasks: selected.map((t) => ({
          title: t.title,
          content: t.content || '',
          taskType: t.taskType || 'read_aloud',
          order: t.order,
        })),
      };
      const res = await teacherService.addDayTasks(payload);
      if (res.errCode !== 0) {
        throw new Error(res.errMsg || '添加失败');
      }
      wx.showToast({ title: `已添加到 ${assignDate}（第${res.dayNumber}天）`, icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      wx.showToast({ title: e.message || '添加失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  handleBack() {
    wx.navigateBack();
  },
});
