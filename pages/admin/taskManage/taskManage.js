const adminService = require('../../../services/admin');
const storage = require('../../../utils/storage');

const TASK_TYPE_LABELS = {
  read_aloud: '朗读',
  read_along: '跟读',
  listening_mcq: '听力',
  dialogue: '对话',
};
const STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
};

const TASK_TYPE_LIST = [
  { key: 'read_aloud', label: '朗读' },
  { key: 'read_along', label: '跟读' },
  { key: 'listening_mcq', label: '听力' },
  { key: 'dialogue', label: '对话' },
];

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

Page({
  data: {
    tasks: [],
    filteredTasks: [],
    loading: false,
    deduping: false,
    importing: false,
    parsingArchive: false,
    publishing: false,

    // Tab filter
    tabs: [
      { key: '', label: '全部' },
      { key: 'read_aloud', label: '朗读' },
      { key: 'read_along', label: '跟读' },
      { key: 'listening_mcq', label: '听力' },
      { key: 'dialogue', label: '对话' },
    ],
    activeTab: '',
    statusTabs: [
      { key: '', label: '全部状态' },
      { key: 'draft', label: '草稿' },
      { key: 'published', label: '已发布' },
    ],
    activeStatus: '',

    // Form
    showForm: false,
    isEditing: false,
    formData: {
      taskId: '',
      title: '',
      content: '',
      taskType: 'read_aloud',
      expectedAnswer: '',
      ttsText: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctOptionKey: 'A',
      sceneId: '',
      sceneName: '',
      sceneDesc: '',
      level: '',
      order: '',
    },

    // Picker data
    taskTypeList: TASK_TYPE_LIST,
    taskTypeIndex: 0,
    correctOptionKeys: OPTION_KEYS,
    correctOptionIndex: 0,

    // Labels for display
    taskTypeLabels: TASK_TYPE_LABELS,
    statusLabels: STATUS_LABELS,
    showImportPanel: false,
    importText: '',
    importPreview: [],
    importPreviewDisplay: [],
    importPreviewOverflow: false,
    importErrors: [],
    importVersionTag: '',
  },

  onShow() {
    this.loadTasks();
  },

  async loadTasks() {
    this.setData({ loading: true });
    try {
      const res = await adminService.listTaskBank();
      if (res && res.errCode === 0) {
        this.setData({ tasks: res.tasks || [] }, () => this.applyFilter());
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      console.error('loadTasks:', e);
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyFilter() {
    const { tasks, activeTab, activeStatus } = this.data;
    let filtered = activeTab
      ? tasks.filter((t) => t.taskType === activeTab)
      : tasks;
    if (activeStatus) {
      filtered = filtered.filter((t) => (t.status || 'draft') === activeStatus);
    }
    this.setData({ filteredTasks: filtered });
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key }, () => this.applyFilter());
  },
  onStatusTabChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeStatus) return;
    this.setData({ activeStatus: key }, () => this.applyFilter());
  },

  // --- Form management ---
  handleAdd() {
    this.setData({
      showForm: true,
      isEditing: false,
      formData: {
        taskId: '',
        title: '',
        content: '',
        taskType: 'read_aloud',
        expectedAnswer: '',
        ttsText: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctOptionKey: 'A',
        sceneId: '',
        sceneName: '',
        sceneDesc: '',
        level: '',
        order: '',
      },
      taskTypeIndex: 0,
      correctOptionIndex: 0,
    });
  },

  handleEdit(e) {
    const taskId = e.currentTarget.dataset.id;
    const task = this.data.tasks.find((t) => t._id === taskId);
    if (!task) return;

    const typeIndex = TASK_TYPE_LIST.findIndex((t) => t.key === task.taskType);
    const opts = task.options || [];
    const optA = (opts.find((o) => o.key === 'A') || {}).text || '';
    const optB = (opts.find((o) => o.key === 'B') || {}).text || '';
    const optC = (opts.find((o) => o.key === 'C') || {}).text || '';
    const optD = (opts.find((o) => o.key === 'D') || {}).text || '';
    const correctIdx = OPTION_KEYS.indexOf(task.correctOptionKey || 'A');

    this.setData({
      showForm: true,
      isEditing: true,
      formData: {
        taskId: task._id,
        title: task.title || '',
        content: task.content || '',
        taskType: task.taskType || 'read_aloud',
        expectedAnswer: task.expectedAnswer || '',
        ttsText: task.ttsText || '',
        optionA: optA,
        optionB: optB,
        optionC: optC,
        optionD: optD,
        correctOptionKey: task.correctOptionKey || 'A',
        sceneId: task.sceneId || '',
        sceneName: task.sceneName || '',
        sceneDesc: task.sceneDesc || '',
        level: task.level != null ? String(task.level) : '',
        order: task.order != null ? String(task.order) : '',
      },
      taskTypeIndex: typeIndex >= 0 ? typeIndex : 0,
      correctOptionIndex: correctIdx >= 0 ? correctIdx : 0,
    });
  },

  handleCancel() {
    this.setData({ showForm: false });
  },
  handleOpenImport() {
    this.setData({
      showImportPanel: true,
      importText: '',
      importPreview: [],
      importPreviewDisplay: [],
      importPreviewOverflow: false,
      importErrors: [],
      importVersionTag: '',
    });
  },
  async handleUploadArchive() {
    try {
      const chooseRes = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['zip', 'docx', 'json'],
      });
      const file = (chooseRes.tempFiles || [])[0];
      if (!file || !file.path) {
        wx.showToast({ title: '未选择文件', icon: 'none' });
        return;
      }

      this.setData({ parsingArchive: true, showImportPanel: true, importErrors: [], importPreview: [], importPreviewDisplay: [] });
      wx.showLoading({ title: '上传中...', mask: true });
      const cloudPath = `task-import/${Date.now()}-${file.name || 'upload'}`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: file.path,
      });
      wx.showLoading({ title: '解析中...', mask: true });
      const parseRes = await adminService.parseTaskArchive({
        fileID: uploadRes.fileID,
        fileName: file.name || '',
      });
      wx.hideLoading();
      if (!parseRes || parseRes.errCode !== 0) {
        throw new Error(parseRes?.errMsg || '解析失败');
      }
      const preview = parseRes.items || [];
      this.setData({
        importPreview: preview,
        importPreviewDisplay: preview.slice(0, 10),
        importPreviewOverflow: preview.length > 10,
        importErrors: parseRes.errors || [],
      });
      wx.showToast({ title: `解析 ${parseRes.total || preview.length} 条`, icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      if (error && /cancel/.test(String(error.errMsg || error.message || ''))) return;
      wx.showToast({ title: error.message || '上传解析失败', icon: 'none' });
    } finally {
      this.setData({ parsingArchive: false });
    }
  },
  handleCancelImport() {
    this.setData({ showImportPanel: false });
  },
  onImportTextInput(e) {
    this.setData({ importText: e.detail.value });
  },
  onImportVersionTagInput(e) {
    this.setData({ importVersionTag: e.detail.value });
  },
  parseImportItem(item, idx) {
    const title = String(item.title || '').trim();
    const taskType = String(item.taskType || '').trim();
    if (!title) return { error: `第 ${idx + 1} 条缺少 title` };
    if (!taskType) return { error: `第 ${idx + 1} 条缺少 taskType` };
    return {
      title,
      content: String(item.content || '').trim(),
      taskType,
      expectedAnswer: item.expectedAnswer,
      ttsText: item.ttsText,
      options: item.options,
      correctOptionKey: item.correctOptionKey,
      sceneId: item.sceneId,
      sceneName: item.sceneName,
      sceneDesc: item.sceneDesc,
      level: item.level,
      order: item.order,
      scoringConfig: item.scoringConfig,
      acceptedAnswers: item.acceptedAnswers,
      keywords: item.keywords,
      status: 'draft',
    };
  },
  handleParseImport() {
    const raw = this.data.importText.trim();
    if (!raw) {
      wx.showToast({ title: '请粘贴 JSON 数组', icon: 'none' });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('必须是 JSON 数组');
      }
      const preview = [];
      const errors = [];
      parsed.forEach((item, idx) => {
        const normalized = this.parseImportItem(item, idx);
        if (normalized.error) {
          errors.push(normalized.error);
        } else {
          preview.push(normalized);
        }
      });
      this.setData({
        importPreview: preview,
        importPreviewDisplay: preview.slice(0, 10),
        importPreviewOverflow: preview.length > 10,
        importErrors: errors,
      });
      if (errors.length > 0) {
        wx.showToast({ title: `有 ${errors.length} 条格式问题`, icon: 'none' });
      } else {
        wx.showToast({ title: `预览 ${preview.length} 条`, icon: 'success' });
      }
    } catch (error) {
      wx.showToast({ title: error.message || 'JSON 解析失败', icon: 'none' });
    }
  },
  async handleConfirmImport() {
    const { importPreview, importVersionTag } = this.data;
    if (!importPreview || importPreview.length === 0) {
      wx.showToast({ title: '请先解析可用数据', icon: 'none' });
      return;
    }
    this.setData({ importing: true });
    try {
      const items = importPreview.map((item) => ({
        ...item,
        versionTag: importVersionTag ? importVersionTag.trim() : '',
      }));
      const res = await adminService.bulkUpsertTasks({ items, mode: 'createOnly' });
      if (!res || res.errCode !== 0) {
        throw new Error(res?.errMsg || '导入失败');
      }
      wx.showToast({ title: `导入 ${res.created || 0} 条`, icon: 'success' });
      this.setData({ showImportPanel: false });
      this.loadTasks();
    } catch (error) {
      wx.showToast({ title: error.message || '导入失败', icon: 'none' });
    } finally {
      this.setData({ importing: false });
    }
  },
  handlePublishDrafts() {
    wx.showModal({
      title: '发布草稿',
      content: '将把所有题库草稿发布为可用版本，确认继续？',
      confirmText: '立即发布',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ publishing: true });
        try {
          const publishRes = await adminService.publishTasks({
            versionTag: this.data.importVersionTag ? this.data.importVersionTag.trim() : '',
          });
          if (!publishRes || publishRes.errCode !== 0) {
            throw new Error(publishRes?.errMsg || '发布失败');
          }
          wx.showToast({ title: `发布 ${publishRes.updated || 0} 条`, icon: 'success' });
          this.loadTasks();
        } catch (error) {
          wx.showToast({ title: error.message || '发布失败', icon: 'none' });
        } finally {
          this.setData({ publishing: false });
        }
      },
    });
  },

  // Input handlers
  onTitleInput(e) {
    this.setData({ 'formData.title': e.detail.value });
  },
  onContentInput(e) {
    this.setData({ 'formData.content': e.detail.value });
  },
  onExpectedAnswerInput(e) {
    this.setData({ 'formData.expectedAnswer': e.detail.value });
  },
  onTtsTextInput(e) {
    this.setData({ 'formData.ttsText': e.detail.value });
  },
  onOptionAInput(e) {
    this.setData({ 'formData.optionA': e.detail.value });
  },
  onOptionBInput(e) {
    this.setData({ 'formData.optionB': e.detail.value });
  },
  onOptionCInput(e) {
    this.setData({ 'formData.optionC': e.detail.value });
  },
  onOptionDInput(e) {
    this.setData({ 'formData.optionD': e.detail.value });
  },
  onSceneIdInput(e) {
    this.setData({ 'formData.sceneId': e.detail.value });
  },
  onSceneNameInput(e) {
    this.setData({ 'formData.sceneName': e.detail.value });
  },
  onSceneDescInput(e) {
    this.setData({ 'formData.sceneDesc': e.detail.value });
  },
  onLevelInput(e) {
    this.setData({ 'formData.level': e.detail.value });
  },
  onOrderInput(e) {
    this.setData({ 'formData.order': e.detail.value });
  },

  onTaskTypePicker(e) {
    const index = parseInt(e.detail.value, 10);
    const type = TASK_TYPE_LIST[index];
    if (type) {
      this.setData({
        taskTypeIndex: index,
        'formData.taskType': type.key,
      });
    }
  },

  onCorrectOptionPicker(e) {
    const index = parseInt(e.detail.value, 10);
    const key = OPTION_KEYS[index];
    if (key) {
      this.setData({
        correctOptionIndex: index,
        'formData.correctOptionKey': key,
      });
    }
  },

  async handleSave() {
    const { formData } = this.data;

    if (!formData.title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }
    if (!formData.taskType) {
      wx.showToast({ title: '请选择任务类型', icon: 'none' });
      return;
    }

    const params = {
      title: formData.title.trim(),
      content: formData.content.trim(),
      taskType: formData.taskType,
      status: 'draft',
    };

    if (formData.taskId) {
      params.taskId = formData.taskId;
    }

    if (formData.order) {
      params.order = Number(formData.order);
    }

    // Type-specific fields
    if (formData.taskType === 'read_aloud' || formData.taskType === 'read_along') {
      params.expectedAnswer = formData.expectedAnswer;
    }

    if (formData.taskType === 'listening_mcq') {
      params.ttsText = formData.ttsText;
      params.options = [];
      if (formData.optionA) params.options.push({ key: 'A', text: formData.optionA });
      if (formData.optionB) params.options.push({ key: 'B', text: formData.optionB });
      if (formData.optionC) params.options.push({ key: 'C', text: formData.optionC });
      if (formData.optionD) params.options.push({ key: 'D', text: formData.optionD });
      params.correctOptionKey = formData.correctOptionKey;
    }

    if (formData.taskType === 'dialogue') {
      params.sceneId = formData.sceneId;
      params.sceneName = formData.sceneName;
      params.sceneDesc = formData.sceneDesc;
      if (formData.level) {
        params.level = Number(formData.level);
      }
    }

    this.setData({ loading: true });
    try {
      const res = await adminService.upsertTask(params);
      if (res && res.errCode === 0) {
        wx.showToast({ title: formData.taskId ? '更新成功' : '添加成功', icon: 'success' });
        this.setData({ showForm: false });
        this.loadTasks();
      } else {
        throw new Error(res?.errMsg || '保存失败');
      }
    } catch (e) {
      console.error('handleSave:', e);
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  handleDelete(e) {
    const taskId = e.currentTarget.dataset.id;
    if (!taskId) return;

    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除此任务吗？',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ loading: true });
        try {
          const result = await adminService.deleteTask({ taskId });
          if (result && result.errCode === 0) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadTasks();
          } else {
            throw new Error(result?.errMsg || '删除失败');
          }
        } catch (err) {
          console.error('handleDelete:', err);
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          this.setData({ loading: false });
        }
      },
    });
  },

  handleDedup() {
    // First do a dry run to show what would be deleted
    wx.showLoading({ title: '分析中...', mask: true });
    adminService.cleanupDuplicates({ dryRun: true }).then((res) => {
      wx.hideLoading();
      if (res.errCode !== 0) {
        wx.showToast({ title: res.errMsg || '分析失败', icon: 'none' });
        return;
      }
      if (res.toDelete === 0) {
        wx.showToast({ title: '没有重复项', icon: 'success' });
        return;
      }
      wx.showModal({
        title: '发现重复项',
        content: `共 ${res.totalTasks} 条任务，${res.duplicateGroups} 组重复，将删除 ${res.toDelete} 条，保留 ${res.toKeep} 条。确认去重？`,
        confirmText: '执行去重',
        confirmColor: '#ef4444',
        success: (modalRes) => {
          if (!modalRes.confirm) return;
          this.setData({ deduping: true });
          adminService.cleanupDuplicates({ dryRun: false }).then((execRes) => {
            this.setData({ deduping: false });
            if (execRes.errCode === 0) {
              wx.showToast({ title: `已删除 ${execRes.deleted} 条重复`, icon: 'success' });
              this.loadTasks();
            } else {
              wx.showToast({ title: execRes.errMsg || '去重失败', icon: 'none' });
            }
          }).catch((err) => {
            this.setData({ deduping: false });
            wx.showToast({ title: err.message || '去重失败', icon: 'none' });
          });
        },
      });
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err.message || '分析失败', icon: 'none' });
    });
  },
});
