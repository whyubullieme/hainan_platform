// pages/student/taskDetail/taskDetail.js
const storage = require('../../../utils/storage');
const studentService = require('../../../services/student');

Page({
  data: {
    taskId: '',
    task: null,
    loading: true,
    submitting: false,
    submitted: false,
    isDemo: false,
    submitNote: '',
    audioFileId: '',
    audioFileName: '',
    uploadingAudio: false,
    isRecording: false,
    recordTempPath: '',
    isDevtools: false,
    submissionResult: null,
    redoComment: '',
    pollTimer: null
  },

  onLoad(options) {
    const taskId = options.taskId;
    const isDemo = storage.getCurrentClassId() === 'demo-class-id';
    let isDevtools = false;
    try {
      const sys = wx.getSystemInfoSync();
      isDevtools = sys && sys.platform === 'devtools';
    } catch (e) {}
    this.setData({ taskId, isDemo, isDevtools });
    if (taskId && !isDemo) {
      this.loadTask();
    } else if (isDemo) {
      this.setDemoTask();
    } else {
      this.setData({ loading: false });
    }
    this.initRecorder();
  },

  onShow() {
    if (this.data.submitted && this.data.task && !this.data.isDemo) {
      this.loadSubmissionResult();
    }
  },

  onUnload() {
    if (this.data.pollTimer) {
      clearTimeout(this.data.pollTimer);
    }
    if (this.recorderManager) {
      try {
        this.recorderManager.stop();
      } catch (e) {}
    }
    if (this.innerAudioContext) {
      try {
        this.innerAudioContext.destroy();
      } catch (e) {}
      this.innerAudioContext = null;
    }
  },

  async loadTask() {
    const { taskId } = this.data;
    this.setData({ loading: true });
    try {
      const res = await studentService.getTaskDetail({ taskId });
      if (res && res.errCode === 0 && res.taskItem) {
        const t = res.taskItem;
        const { submitted, submissionResult, redoComment } = await this.checkSubmittedWithResult(t.taskItemId, t.dayNumber);
        this.setData({
          task: t,
          submitted,
          submissionResult,
          redoComment,
          loading: false
        });
        if (submitted) this.schedulePoll(submissionResult);
      } else {
        throw new Error(res?.errMsg || '加载失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async checkSubmittedWithResult(taskItemId, dayNumber) {
    const classId = storage.getCurrentClassId();
    if (!classId) return { submitted: false, submissionResult: null };
    try {
      const res = await studentService.getMySubmissions({ classId });
      if (res && res.errCode === 0 && res.records) {
        const rec = res.records.find(r => String(r.taskItemId) === String(taskItemId) && r.dayNumber === dayNumber);
        if (!rec) return { submitted: false, submissionResult: null };
        return {
          submitted: !rec.needsRedo,
          submissionResult: rec.needsRedo ? null : {
            evaluationStatus: rec.evaluationStatus || 'pending',
            asrText: rec.asrText,
            semanticScore: rec.semanticScore,
            pronScore: rec.pronScore,
            finalScore: rec.finalScore,
            semanticPassed: rec.semanticPassed,
            pronDetails: rec.pronDetails,
            evaluationError: rec.evaluationError
          },
          redoComment: rec.needsRedo ? (rec.redoComment || '老师已打回，请重做后重新提交') : ''
        };
      }
    } catch (_) {}
    return { submitted: false, submissionResult: null, redoComment: '' };
  },

  async loadSubmissionResult() {
    const { task } = this.data;
    if (!task) return;
    const { submitted, submissionResult, redoComment } = await this.checkSubmittedWithResult(task.taskItemId, task.dayNumber);
    this.setData({ submitted, submissionResult, redoComment });
    this.schedulePoll(submissionResult);
  },

  schedulePoll(submissionResult) {
    if (this.data.pollTimer) clearTimeout(this.data.pollTimer);
    const status = submissionResult && submissionResult.evaluationStatus;
    if (status === 'pending' || status === 'running') {
      const timer = setTimeout(() => this.loadSubmissionResult(), 2000);
      this.setData({ pollTimer: timer });
    }
  },

  setDemoTask() {
    this.setData({
      task: {
        taskItemId: 'demo1',
        title: '入住场景对话练习',
        content: '跟随音频练习酒店入住英语对话',
        taskType: 'read_along',
        dayNumber: 1
      },
      submitted: false,
      loading: false
    });
  },

  async handleMarkSubmit() {
    const { task, isDemo } = this.data;
    if (!task || isDemo) return;
    const classId = storage.getCurrentClassId();
    if (!classId) {
      wx.showToast({ title: '请先加入班级', icon: 'none' });
      return;
    }
    const note = (this.data.submitNote || '').trim();
    const hasAudio = !!this.data.audioFileId;
    const taskType = task.taskType || 'read_aloud';

    if (taskType === 'read_aloud') {
      if (!hasAudio) {
        wx.showToast({ title: '朗读任务需上传音频', icon: 'none' });
        return;
      }
    } else if (taskType === 'read_along') {
      if (!hasAudio || !note) {
        wx.showToast({ title: '跟读任务需提交音频和文字', icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });
    try {
      const res = await studentService.markSubmit({
        classId,
        dayNumber: task.dayNumber,
        taskItemId: task.taskItemId,
        note,
        audioFileId: this.data.audioFileId || '',
        audioFileName: this.data.audioFileName || ''
      });
      if (res && res.errCode === 0) {
        wx.showToast({ title: '提交成功，评测中...', icon: 'success' });
        const { submissionResult } = await this.checkSubmittedWithResult(task.taskItemId, task.dayNumber);
        this.setData({
          submitted: true,
          submissionResult: submissionResult || { evaluationStatus: 'pending' },
          redoComment: ''
        });
        this.schedulePoll(submissionResult || { evaluationStatus: 'pending' });
      } else {
        throw new Error(res?.errMsg || '操作失败');
      }
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onSubmitNoteInput(e) {
    this.setData({ submitNote: e.detail.value || '' });
  },

  initRecorder() {
    this.recorderManager = wx.getRecorderManager();
    this.recorderManager.onStart(() => {
      this.setData({ isRecording: true });
    });
    this.recorderManager.onStop(async (res) => {
      const tempPath = res && res.tempFilePath ? res.tempFilePath : '';
      this.setData({ isRecording: false, recordTempPath: tempPath });
      if (!tempPath) {
        wx.showToast({ title: '录音失败', icon: 'none' });
        return;
      }
      await this.uploadRecordedAudio(tempPath);
    });
    this.recorderManager.onError(() => {
      this.setData({ isRecording: false });
      wx.showToast({ title: '录音失败', icon: 'none' });
    });
  },

  startRecord() {
    if (this.data.uploadingAudio || this.data.isRecording) return;
    if (this.data.isDevtools) {
      wx.showToast({ title: '开发工具请用“从文件选择音频”', icon: 'none' });
      return;
    }
    try {
      this.recorderManager.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 96000,
        format: 'mp3'
      });
    } catch (e) {
      wx.showToast({ title: '无法开始录音', icon: 'none' });
    }
  },

  stopRecord() {
    if (!this.data.isRecording) return;
    try {
      this.recorderManager.stop();
    } catch (e) {
      this.setData({ isRecording: false });
    }
  },

  async chooseAndUploadAudioFile() {
    if (this.data.uploadingAudio) return;
    try {
      const chooseRes = await wx.chooseMessageFile({
        count: 1,
        type: 'file'
      });
      const file = (chooseRes.tempFiles && chooseRes.tempFiles[0]) || null;
      if (!file || !file.path) return;

      const name = file.name || '';
      const lower = name.toLowerCase();
      const isAudio = lower.endsWith('.mp3');
      if (!isAudio) {
        wx.showToast({ title: '请上传 mp3 音频', icon: 'none' });
        return;
      }

      await this.uploadRecordedAudio(file.path, name);
    } catch (e) {
      if (e && e.errMsg && e.errMsg.includes('cancel')) return;
      wx.showToast({ title: (e && e.message) || '选择文件失败', icon: 'none' });
    }
  },

  async uploadRecordedAudio(tempPath, overrideName = '') {
    if (this.data.uploadingAudio) return;
    try {
      const { task } = this.data;
      const classId = storage.getCurrentClassId();
      const ts = Date.now();
      const ext = '.mp3';
      const cloudPath = `submission-audio/${classId}/${task.dayNumber}/${task.taskItemId}/${ts}${ext}`;

      this.setData({ uploadingAudio: true });
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath
      });

      if (!uploadRes || !uploadRes.fileID) {
        throw new Error('上传失败');
      }

      this.setData({
        audioFileId: uploadRes.fileID,
        audioFileName: overrideName || `录音_${ts}${ext}`
      });
      wx.showToast({ title: '音频已上传', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploadingAudio: false });
    }
  },

  playRecord() {
    if (!this.data.recordTempPath) return;
    if (!this.innerAudioContext) {
      this.innerAudioContext = wx.createInnerAudioContext();
    }
    this.innerAudioContext.src = this.data.recordTempPath;
    this.innerAudioContext.play();
  },

  clearAudio() {
    this.setData({
      audioFileId: '',
      audioFileName: ''
    });
  },

  handleLogout() {
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
