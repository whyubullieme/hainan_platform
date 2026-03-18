// pages/student/taskList/taskList.js
const storage = require('../../../utils/storage');
const studentService = require('../../../services/student');
const { buildPagination } = require('../../../utils/pagination');

const PAGE_SIZE = 10;

const TYPE_LABELS = {
  read_aloud:    '朗读',
  listening_mcq: '听力',
  dialogue:      '对话',
  read_along:    '跟读'
};

Page({
  data: {
    taskType: '',
    typeLabel: '',
    allTasks: [],
    displayedTasks: [],
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    loading: false,
    isDemo: false
  },

  onLoad(options) {
    const taskType = options.type || 'read_aloud';
    const isDemo = storage.getCurrentClassId() === 'demo-class-id';
    this.setData({
      taskType,
      typeLabel: TYPE_LABELS[taskType] || taskType,
      isDemo
    });
    wx.setNavigationBarTitle({ title: TYPE_LABELS[taskType] || '任务列表' });
    this.loadTasks();
  },

  onShow() {
    if (this.data.allTasks.length > 0) {
      this.loadTasks();
    }
  },

  async loadTasks() {
    const { taskType, isDemo } = this.data;

    if (isDemo) {
      this._applyDemoData(taskType);
      return;
    }

    const classId = storage.getCurrentClassId();
    if (!classId) {
      wx.showToast({ title: '请先加入班级', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await studentService.getFullPlan({ classId });
      if (res && res.errCode === 0) {
        const submittedIds = new Set();
        (res.days || []).forEach(d => {
          (d.submittedTaskIds || []).forEach(id => submittedIds.add(id));
        });

        const allTasks = [];
        (res.days || []).forEach(d => {
          (d.tasks || []).forEach(t => {
            if (t.taskType === taskType) {
              allTasks.push({
                ...t,
                dayNumber: d.dayNumber,
                dateStr: d.dateStr,
                submitted: submittedIds.has(t.taskItemId)
              });
            }
          });
        });

        this._paginate(allTasks, 1);
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  _paginate(allTasks, page) {
    const pagination = buildPagination(allTasks, page, PAGE_SIZE);
    this.setData({
      allTasks,
      displayedTasks: pagination.pageItems,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems
    });
  },

  onPageChange(e) {
    const { page } = e.detail;
    const pagination = buildPagination(this.data.allTasks, page, PAGE_SIZE);
    this.setData({
      displayedTasks: pagination.pageItems,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 150 });
  },

  viewTask(e) {
    const taskId = e.currentTarget.dataset.taskId;
    const taskType = e.currentTarget.dataset.taskType;
    if (!taskId) {
      wx.showToast({ title: '任务ID缺失', icon: 'none' });
      return;
    }
    const encodedTaskId = encodeURIComponent(String(taskId));
    if (taskType === 'dialogue') {
      wx.navigateTo({ url: `/pages/student/dialogue/dialogue?taskId=${encodedTaskId}&taskItemId=${encodedTaskId}` });
    } else {
      wx.navigateTo({ url: `/pages/student/taskDetail/taskDetail?taskId=${encodedTaskId}` });
    }
  },

  _applyDemoData(taskType) {
    const demoMap = {
      read_aloud: [
        { taskItemId: 'demo-ra-1', title: '前台欢迎语', content: 'Good morning, welcome to our hotel!', dayNumber: 1, dateStr: '2024-01-01', submitted: false },
        { taskItemId: 'demo-ra-2', title: '餐厅介绍',   content: 'Our restaurant opens from 7 AM to 10 PM.', dayNumber: 2, dateStr: '2024-01-02', submitted: true }
      ],
      listening_mcq: [
        { taskItemId: 'demo-lm-1', title: '听力训练 1', content: '听句子，选择最合适的中文意思', dayNumber: 1, dateStr: '2024-01-01', submitted: false },
        { taskItemId: 'demo-lm-2', title: '听力训练 2', content: '听句子，选择最合适的中文意思', dayNumber: 2, dateStr: '2024-01-02', submitted: false }
      ],
      dialogue: [],
      read_along: [
        { taskItemId: 'demo-al-1', title: '跟读练习 1', content: 'May I help you?', dayNumber: 1, dateStr: '2024-01-01', submitted: false },
        { taskItemId: 'demo-al-2', title: '跟读练习 2', content: 'Have a nice day!', dayNumber: 2, dateStr: '2024-01-02', submitted: true }
      ]
    };
    this._paginate(demoMap[taskType] || [], 1);
  }
});
