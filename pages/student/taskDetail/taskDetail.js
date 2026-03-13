// pages/student/taskDetail/taskDetail.js
const storage = require('../../../utils/storage');
const studentService = require('../../../services/student');

function normalizeOptions(options = []) {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt, idx) => {
      if (!opt) return null;
      if (typeof opt === 'string') {
        return { key: String.fromCharCode(65 + idx), text: opt.trim() };
      }
      const key = String(opt.key || String.fromCharCode(65 + idx)).trim().slice(0, 1).toUpperCase();
      const text = String(opt.text || '').trim();
      if (!key || !text) return null;
      return { key, text };
    })
    .filter(Boolean)
    .slice(0, 4);
}

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
    pollTimer: null,

    isListeningSession: false,
    sessionTitle: '听力训练',
    listeningQuestions: [],
    currentQuestionIndex: 0,
    currentQuestion: null,
    sessionAnswers: {},
    sessionAnsweredCount: 0,
    sessionResult: null,

    playingPrompt: false,
    synthesizingPrompt: false
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
    if (!this.data.isListeningSession && this.data.submitted && this.data.task && !this.data.isDemo) {
      this.loadSubmissionResult();
    }
  },

  onUnload() {
    if (this.data.pollTimer) {
      clearTimeout(this.data.pollTimer);
    }
    if (this.recorderManager) {
      try { this.recorderManager.stop(); } catch (e) {}
    }
    if (this.innerAudioContext) {
      try { this.innerAudioContext.destroy(); } catch (e) {}
      this.innerAudioContext = null;
    }
    if (this.promptAudioContext) {
      try { this.promptAudioContext.destroy(); } catch (e) {}
      this.promptAudioContext = null;
    }
  },

  async loadTask() {
    const { taskId } = this.data;
    this.setData({ loading: true });

    try {
      const res = await studentService.getTaskDetail({ taskId });
      if (!res || res.errCode !== 0 || !res.taskItem) {
        throw new Error(res?.errMsg || '加载失败');
      }

      const task = {
        ...res.taskItem,
        options: normalizeOptions(res.taskItem.options || [])
      };

      if ((task.taskType || '') === 'listening_mcq') {
        await this.loadListeningSession(task.taskItemId, task.dayNumber);
        return;
      }

      const { submitted, submissionResult, redoComment } = await this.checkSubmittedWithResult(task.taskItemId, task.dayNumber);
      this.setData({
        task,
        submitted,
        submissionResult,
        redoComment,
        loading: false,
        isListeningSession: false,
      });

      if (submitted) this.schedulePoll(submissionResult);
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async loadListeningSession(anchorTaskId, dayNumber) {
    const res = await studentService.getListeningSession({ taskId: anchorTaskId });
    if (!res || res.errCode !== 0) {
      throw new Error(res?.errMsg || '加载听力题失败');
    }

    const questions = (res.questions || []).map((q) => ({
      ...q,
      options: normalizeOptions(q.options || [])
    }));

    if (questions.length === 0) {
      throw new Error('今日暂无听力题');
    }

    this.setData({
      task: {
        taskItemId: anchorTaskId,
        title: '听力训练',
        taskType: 'listening_mcq',
        dayNumber: Number(res.dayNumber) || Number(dayNumber) || 1,
      },
      isListeningSession: true,
      sessionTitle: res.title || '听力训练',
      listeningQuestions: questions,
      currentQuestionIndex: 0,
      currentQuestion: questions[0],
      sessionAnswers: {},
      sessionAnsweredCount: 0,
      sessionResult: null,
      submitted: false,
      submissionResult: null,
      redoComment: '',
      loading: false,
      playingPrompt: false,
      synthesizingPrompt: false,
    });
  },

  updateSessionProgress(nextAnswers) {
    const answers = nextAnswers || this.data.sessionAnswers || {};
    const total = (this.data.listeningQuestions || []).length;
    const answeredCount = (this.data.listeningQuestions || []).filter((q) => !!answers[q.taskItemId]).length;
    this.setData({ sessionAnsweredCount: Math.min(answeredCount, total) });
  },

  updateCurrentQuestion(index) {
    const questions = this.data.listeningQuestions || [];
    if (!questions.length) return;
    const safeIndex = Math.max(0, Math.min(index, questions.length - 1));
    this.stopPromptAudio();
    this.setData({
      currentQuestionIndex: safeIndex,
      currentQuestion: questions[safeIndex],
      synthesizingPrompt: false,
    });
  },

  onSessionOptionChange(e) {
    const key = String(e.detail.value || '').trim().slice(0, 1).toUpperCase();
    const question = this.data.currentQuestion;
    if (!question || !question.taskItemId || !key) return;

    const sessionAnswers = {
      ...this.data.sessionAnswers,
      [question.taskItemId]: key,
    };
    this.setData({ sessionAnswers });
    this.updateSessionProgress(sessionAnswers);
  },

  goPrevQuestion() {
    this.updateCurrentQuestion(this.data.currentQuestionIndex - 1);
  },

  goNextQuestion() {
    const question = this.data.currentQuestion;
    if (question && !this.data.sessionAnswers[question.taskItemId]) {
      wx.showToast({ title: '请先选择一个答案', icon: 'none' });
      return;
    }
    this.updateCurrentQuestion(this.data.currentQuestionIndex + 1);
  },

  async handleSubmitListeningSession() {
    const { task, listeningQuestions, sessionAnswers, isDemo } = this.data;
    if (!task || !Array.isArray(listeningQuestions) || listeningQuestions.length === 0) return;

    const unanswered = listeningQuestions.filter((q) => !sessionAnswers[q.taskItemId]);
    if (unanswered.length > 0) {
      wx.showToast({ title: `还有 ${unanswered.length} 题未作答`, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      if (isDemo) {
        const items = listeningQuestions.map((q, idx) => {
          const selectedOptionKey = sessionAnswers[q.taskItemId] || '';
          const correctOptionKey = String(q.correctOptionKey || '').trim().slice(0, 1).toUpperCase();
          const selectedOptionText = (q.options || []).find((o) => o.key === selectedOptionKey)?.text || '';
          const correctOptionText = (q.options || []).find((o) => o.key === correctOptionKey)?.text || '';
          return {
            questionNo: idx + 1,
            taskItemId: q.taskItemId,
            title: '听力训练',
            selectedOptionKey,
            selectedOptionText,
            correctOptionKey,
            correctOptionText,
            isCorrect: selectedOptionKey === correctOptionKey,
          };
        });
        const correctCount = items.filter((x) => x.isCorrect).length;
        const total = items.length;
        this.setData({
          sessionResult: {
            total,
            correctCount,
            score: Math.round((correctCount / total) * 100),
            items,
          },
          submitted: true,
        });
        return;
      }

      const answers = listeningQuestions.map((q) => ({
        taskItemId: q.taskItemId,
        selectedOptionKey: sessionAnswers[q.taskItemId] || '',
      }));

      const res = await studentService.submitListeningSession({
        anchorTaskId: task.taskItemId,
        answers,
      });

      if (!res || res.errCode !== 0) {
        throw new Error(res?.errMsg || '提交失败');
      }

      this.setData({
        sessionResult: {
          total: Number(res.total) || listeningQuestions.length,
          correctCount: Number(res.correctCount) || 0,
          score: Number(res.score) || 0,
          items: res.items || [],
        },
        submitted: true,
      });
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async checkSubmittedWithResult(taskItemId, dayNumber) {
    const classId = storage.getCurrentClassId();
    if (!classId) return { submitted: false, submissionResult: null };
    try {
      const res = await studentService.getMySubmissions({ classId });
      if (res && res.errCode === 0 && res.records) {
        const rec = res.records.find((r) => String(r.taskItemId) === String(taskItemId) && r.dayNumber === dayNumber);
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
    const questions = [
      {
        taskItemId: 'demo_listen_1',
        title: '听力训练',
        order: 1,
        promptAudioUrl: '',
        ttsText: 'Could you tell me how much one night in a standard room is?',
        options: [
          { key: 'A', text: '他想问标准间每晚价格。' },
          { key: 'B', text: '他想让酒店帮忙叫车。' },
          { key: 'C', text: '他想申请延迟退房。' },
          { key: 'D', text: '他想更换无烟房。' },
        ],
        correctOptionKey: 'A',
      },
      {
        taskItemId: 'demo_listen_2',
        title: '听力训练',
        order: 2,
        promptAudioUrl: '',
        ttsText: 'Could you tell me the Wi-Fi password?',
        options: [
          { key: 'A', text: '他想订早餐。' },
          { key: 'B', text: '他想问 Wi-Fi 密码。' },
          { key: 'C', text: '他想换房。' },
          { key: 'D', text: '他想投诉噪音。' },
        ],
        correctOptionKey: 'B',
      },
      {
        taskItemId: 'demo_listen_3',
        title: '听力训练',
        order: 3,
        promptAudioUrl: '',
        ttsText: 'Could I have a late check-out?',
        options: [
          { key: 'A', text: '他想提前入住。' },
          { key: 'B', text: '他想加床。' },
          { key: 'C', text: '他想申请延迟退房。' },
          { key: 'D', text: '他想寄存行李。' },
        ],
        correctOptionKey: 'C',
      },
    ];

    this.setData({
      task: {
        taskItemId: 'demo_anchor',
        title: '听力训练',
        taskType: 'listening_mcq',
        dayNumber: 1,
      },
      isListeningSession: true,
      sessionTitle: '听力训练',
      listeningQuestions: questions,
      currentQuestionIndex: 0,
      currentQuestion: questions[0],
      sessionAnswers: {},
      sessionAnsweredCount: 0,
      sessionResult: null,
      submitted: false,
      loading: false,
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

  getPromptAudioContext() {
    if (!this.promptAudioContext) {
      this.promptAudioContext = wx.createInnerAudioContext();
      this.promptAudioContext.onEnded(() => this.setData({ playingPrompt: false }));
      this.promptAudioContext.onStop(() => this.setData({ playingPrompt: false }));
      this.promptAudioContext.onError(() => {
        this.setData({ playingPrompt: false });
        wx.showToast({ title: '播放失败', icon: 'none' });
      });
    }
    return this.promptAudioContext;
  },

  playLocalPromptAudio(url) {
    if (!url) return;
    const ctx = this.getPromptAudioContext();
    ctx.src = url;
    ctx.play();
    this.setData({ playingPrompt: true });
  },

  playPromptAudio() {
    const { currentQuestion, playingPrompt } = this.data;
    if (!currentQuestion) return;
    if (playingPrompt) {
      this.stopPromptAudio();
      return;
    }

    const promptAudioUrl = (currentQuestion.promptAudioUrl || '').trim();
    if (promptAudioUrl) {
      this.playLocalPromptAudio(promptAudioUrl);
      return;
    }

    const ttsText = (currentQuestion.ttsText || '').trim();
    if (!ttsText) {
      wx.showToast({ title: '该题缺少音频与文本', icon: 'none' });
      return;
    }
    if (this.data.synthesizingPrompt) return;

    this.setData({ synthesizingPrompt: true });
    studentService.synthesizeXfyunTts({ text: ttsText })
      .then((res) => {
        const url = (res && res.audioUrl) ? String(res.audioUrl).trim() : '';
        if (!url) throw new Error('合成结果为空');

        const idx = this.data.currentQuestionIndex;
        const questions = [...this.data.listeningQuestions];
        if (!questions[idx]) return;
        questions[idx] = {
          ...questions[idx],
          promptAudioUrl: url,
        };

        this.setData({
          listeningQuestions: questions,
          currentQuestion: questions[idx],
        });
        this.playLocalPromptAudio(url);
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '题干朗读生成失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ synthesizingPrompt: false });
      });
  },

  stopPromptAudio() {
    if (this.promptAudioContext) {
      this.promptAudioContext.stop();
    }
    this.setData({ playingPrompt: false });
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
      const chooseRes = await wx.chooseMessageFile({ count: 1, type: 'file' });
      const file = (chooseRes.tempFiles && chooseRes.tempFiles[0]) || null;
      if (!file || !file.path) return;

      const name = file.name || '';
      const lower = name.toLowerCase();
      if (!lower.endsWith('.mp3')) {
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
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
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
    this.setData({ audioFileId: '', audioFileName: '' });
  },

  handleLogout() {
    this.stopPromptAudio();
    storage.clearAuth();
    wx.reLaunch({ url: '/pages/auth/login/login' });
  }
});
