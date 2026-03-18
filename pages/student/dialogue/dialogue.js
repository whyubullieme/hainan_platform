// pages/student/dialogue/dialogue.js
// 语音对话练习 — 通过 WebSocket 网关连接豆包 Realtime API
const studentService = require('../../../services/student');

// ─── 配置 ────────────────────────────────────────────────────────────────────
const GATEWAY_URL = 'wss://api.lnpec.com/ws';

// ─── Debug logger ─────────────────────────────────────────────────────────────
const D = {
  log:  (...a) => console.log( '[DLG]', ...a),
  warn: (...a) => console.warn('[DLG]', ...a),
  err:  (...a) => console.error('[DLG]', ...a),
  api:  (name, params, res) => console.log(`[API] ${name}`, 'params:', JSON.stringify(params), '→', JSON.stringify(res).slice(0, 200)),
};

const LEVEL_TIPS = {
  1: '简单英语即可，大意对就好',
  2: '用礼貌的酒店用语回复',
  3: '尽量使用专业、地道的英语'
};

const EVAL_POLL_INTERVAL = 3000; // 3s polling

const recorderManager = wx.getRecorderManager();

Page({
  data: {
    taskItemId: '',
    sessionId: '',        // cloud DB session id
    sceneName: '',
    sceneDesc: '',
    sceneId: '',
    level: 1,
    levelTip: '',
    currentRound: 0,
    maxRounds: 3,
    roundDots: [],
    messages: [],
    inputText: '',
    loading: true,
    sending: false,
    isSessionEnd: false,
    totalScore: null,
    passed: false,
    summary: '',

    // voice / gateway
    voiceMode: false,     // false=文字输入(default), true=语音输入
    recording: false,
    wsConnected: false,
    gatewayReady: false,
    revealId: null,       // id of AI message whose text is currently revealed

    // evaluation state
    evaluationStatus: null,   // null | 'pending' | 'running' | 'completed' | 'failed'
    finalScore: null,         // formal evaluation score
    semanticScore: null,
    avgPronScore: null,
    semanticBreakdown: null,
    semanticFeedback: null,
    expressionsUsed: [],
    pronResults: [],
  },

  _ws: null,              // SocketTask
  _turns: [],             // local turn log for batch-save
  _evalTimer: null,       // polling timer
  _audioBuf: [],          // accumulated binary TTS frames for current turn
  _audioCtx: null,        // InnerAudioContext currently playing

  // ═══ Lifecycle ═══════════════════════════════════════════════════════════════

  onLoad(options) {
    const taskItemId = (options && (options.taskId || options.taskItemId)) || '';
    if (!taskItemId) {
      wx.showToast({ title: '缺少任务参数', icon: 'none' });
      return setTimeout(() => wx.navigateBack(), 300);
    }
    this.setData({ taskItemId });
    this._setupRecorder();
    this._startSession(taskItemId);
  },

  onUnload() {
    this._closeGateway();
    this._stopEvalPolling();
  },

  onHide() {
    // stop recording if active
    if (this.data.recording) {
      recorderManager.stop();
      this.setData({ recording: false });
    }
  },

  // ═══ Session init ════════════════════════════════════════════════════════════

  async _startSession(taskItemId) {
    D.log('_startSession', taskItemId);
    this.setData({
      loading: true, messages: [], currentRound: 0,
      isSessionEnd: false, totalScore: null, summary: '',
      gatewayReady: false, wsConnected: false,
      evaluationStatus: null, finalScore: null,
      semanticScore: null, avgPronScore: null,
      semanticBreakdown: null, semanticFeedback: null,
      expressionsUsed: [], pronResults: [],
    });
    this._turns = [];
    this._stopEvalPolling();

    try {
      // 1. Cloud function: create DB session
      D.log('[1/2] calling dialogue_startSession…');
      const params = { taskItemId };
      const res = await studentService.dialogueStartSession(params);
      D.api('dialogue_startSession', params, res);
      if (!res || res.errCode !== 0) throw new Error(res?.errMsg || '开始会话失败');

      wx.setNavigationBarTitle({ title: `${res.sceneName} · 对话练习` });
      this.setData({
        sessionId: res.sessionId,
        sceneName: res.sceneName,
        sceneDesc: res.sceneDesc || '',
        sceneId: res.sceneId || 'scene_checkin',
        level: res.level,
        levelTip: LEVEL_TIPS[res.level] || LEVEL_TIPS[1],
        maxRounds: res.maxRounds,
        currentRound: 0,
        loading: false,
      });
      this._updateDots();
      D.log('session created, sessionId:', res.sessionId, 'sceneId:', res.sceneId);

      // 2. Connect gateway WS
      D.log('[2/2] connecting gateway', GATEWAY_URL);
      this._connectGateway();
    } catch (e) {
      D.err('_startSession failed:', e.message);
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // ═══ Gateway WebSocket ═══════════════════════════════════════════════════════

  _connectGateway() {
    if (this._ws) this._closeGateway();
    D.log('[ws] wx.connectSocket →', GATEWAY_URL);

    const ws = wx.connectSocket({
      url: GATEWAY_URL,
      success: () => D.log('[ws] connectSocket success (pending open…)'),
      fail: (err) => {
        D.err('[ws] connectSocket fail (immediate)', JSON.stringify(err));
        this._fallbackToText('网关连接失败，使用文字模式');
      }
    });

    ws.onOpen(() => {
      D.log('[ws] ✓ OPEN — sending startSession');
      this.setData({ wsConnected: true });
      const payload = { action: 'startSession', sceneId: this.data.sceneId, level: this.data.level };
      D.log('[ws] ▶', JSON.stringify(payload));
      ws.send({ data: JSON.stringify(payload) });
    });

    ws.onMessage((res) => {
      if (typeof res.data !== 'string') {
        // Binary = TTS audio chunk from Doubao — accumulate until audioEnd
        this._audioBuf.push(res.data);
        return;
      }
      let msg;
      try { msg = JSON.parse(res.data); } catch { return; }
      this._handleGatewayMsg(msg);
    });

    ws.onClose((e) => {
      D.warn('[ws] CLOSED code:', e && e.code, 'reason:', e && e.reason);
      this.setData({ wsConnected: false, gatewayReady: false });
    });

    ws.onError((err) => {
      D.err('[ws] ERROR', JSON.stringify(err));
      this._fallbackToText('网关连接错误');
    });

    this._ws = ws;
  },

  _closeGateway() {
    if (this._ws) {
      try { this._ws.send({ data: JSON.stringify({ action: 'endSession' }) }); } catch {}
      try { this._ws.close(); } catch {}
      this._ws = null;
    }
    this._audioBuf = [];
    if (this._audioCtx) { try { this._audioCtx.stop(); this._audioCtx.destroy(); } catch {} this._audioCtx = null; }
    this.setData({ wsConnected: false, gatewayReady: false });
  },

  _fallbackToText(reason) {
    D.warn('[fallback]', reason);
    this.setData({ voiceMode: false });
    wx.showToast({ title: reason, icon: 'none', duration: 2000 });
  },

  _playAudio() {
    const bufs = this._audioBuf;
    this._audioBuf = [];
    if (!bufs.length) return;

    // Concatenate all ArrayBuffer chunks
    const totalBytes = bufs.reduce((s, b) => s + b.byteLength, 0);
    D.log('[audio] playing', bufs.length, 'chunks,', totalBytes, 'bytes total');
    const combined = new Uint8Array(totalBytes);
    let off = 0;
    for (const b of bufs) { combined.set(new Uint8Array(b), off); off += b.byteLength; }

    // Write to temp file and play
    const filePath = `${wx.env.USER_DATA_PATH}/tts_${Date.now()}.mp3`;
    wx.getFileSystemManager().writeFile({
      filePath,
      data: combined.buffer,
      encoding: 'binary',
      success: () => {
        D.log('[audio] wrote temp file, playing:', filePath);
        if (this._audioCtx) {
          try { this._audioCtx.stop(); this._audioCtx.destroy(); } catch {}
        }
        const ctx = wx.createInnerAudioContext();
        ctx.src = filePath;
        ctx.onError((e) => D.err('[audio] playback error:', e.errMsg));
        ctx.play();
        this._audioCtx = ctx;

        // Save audioPath on last AI message so user can replay
        const msgs = [...this.data.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'ai') { msgs[i].audioPath = filePath; break; }
        }
        this.setData({ messages: msgs });
      },
      fail: (e) => D.err('[audio] writeFile failed:', e.errMsg),
    });
  },

  _handleGatewayMsg(msg) {
    D.log('[ws] ◀', msg.type, JSON.stringify(msg).slice(0, 300));

    switch (msg.type) {
      case 'sessionReady':
        this.setData({ gatewayReady: true });
        // AI will speak first via SayHello → greeting event
        break;

      case 'greeting':
        // AI's first line (predefined scene greeting, not a scored turn)
        // aiChunk events may have already created a streaming message — just finalize
        this._finalizeAiMessage(msg.text, '', null);
        this._scrollToBottom();
        break;

      case 'aiChunk':
        // streaming AI text — update last AI message or create one
        this._appendAiChunk(msg.text);
        break;

      case 'turnComplete': {
        const round = msg.round || (this.data.currentRound + 1);
        const isEnd = !!msg.isSessionEnd;

        // Finalize AI message with feedback (coachScore from gateway)
        this._finalizeAiMessage(msg.aiReply, msg.aiFeedback, msg.coachScore);

        this.setData({
          currentRound: round,
          isSessionEnd: isEnd,
          sending: false,
        });

        if (isEnd) {
          this._onSessionEnd(msg);
        }

        // Save turn locally — include inputMode, audioFileId, asrText
        const turnData = {
          round,
          userText: this._lastUserText || '',
          aiReply: msg.aiReply,
          aiFeedback: msg.aiFeedback,
          coachScore: msg.coachScore,
          inputMode: this._lastInputMode || 'text',
          audioFileId: this._lastAudioFileId || null,
          asrText: this._lastAsrText || null,
        };
        this._turns.push(turnData);
        this._lastUserText = '';
        this._lastInputMode = 'text';
        this._lastAudioFileId = null;
        this._lastAsrText = null;

        this._updateDots();
        this._scrollToBottom();
        break;
      }

      case 'error':
        wx.showToast({ title: msg.message || '网关错误', icon: 'none' });
        this.setData({ sending: false });
        break;

      case 'audioEnd':
        D.log('[audio] audioEnd received, buf chunks:', this._audioBuf.length);
        this._playAudio();
        break;

      case 'doubaoDisconnected':
        this._fallbackToText('AI 连接断开');
        break;

      case 'sessionClosed':
        break;

      default:
        console.log('[ws] unhandled msg type:', msg.type);
    }
  },

  // ═══ AI message helpers ══════════════════════════════════════════════════════

  _streamingAiId: null,

  _appendAiChunk(text) {
    const msgs = [...this.data.messages];
    const last = msgs[msgs.length - 1];

    if (last && last.role === 'ai' && last._streaming) {
      // Append to existing streaming message
      last.text += text;
      this.setData({ messages: msgs });
    } else {
      // Create new streaming AI message
      const id = msgs.length;
      msgs.push({ id, role: 'ai', text, feedback: '', coachScore: null, _streaming: true });
      this.setData({ messages: msgs });
      this._streamingAiId = id;
    }
    this._scrollToBottom();
  },

  _finalizeAiMessage(aiReply, feedback, coachScore) {
    const msgs = [...this.data.messages];
    const last = msgs[msgs.length - 1];

    if (last && last.role === 'ai' && last._streaming) {
      last.text = aiReply || last.text;
      last.feedback = feedback || '';
      last.coachScore = coachScore != null ? coachScore : null;
      last._streaming = false;
      this.setData({ messages: msgs });
    } else {
      // No streaming msg — create final AI message directly
      msgs.push({
        id: msgs.length,
        role: 'ai',
        text: aiReply || '…',
        feedback: feedback || '',
        coachScore: coachScore != null ? coachScore : null,
      });
      this.setData({ messages: msgs });
    }
  },

  _onSessionEnd(msg) {
    const scores = this._turns.map(t => t.coachScore).filter(s => s != null);
    const total = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;  // null = no inline scores, wait for formal evaluation
    this.setData({
      totalScore: total,
      passed: total != null ? total >= 60 : true,   // optimistic until formal score
      summary: msg.summary || '',
    });

    // Persist to cloud DB (fire-and-forget) + triggers async evaluation
    this._saveSessionResult();
  },

  async _saveSessionResult() {
    D.log('[save] calling dialogue_saveResult, turns:', this._turns.length);
    try {
      const params = {
        sessionId: this.data.sessionId,
        turns: this._turns,
        totalScore: this.data.totalScore,
        passed: this.data.passed,
        summary: this.data.summary,
      };
      const res = await studentService.dialogueSaveResult(params);
      D.api('dialogue_saveResult', { sessionId: params.sessionId, turns: params.turns.length }, res);
      // Start polling for evaluation result
      this.setData({ evaluationStatus: 'pending' });
      this._startEvalPolling();
    } catch (e) {
      D.err('dialogue_saveResult failed:', e.message);
    }
  },

  // ═══ Evaluation polling ═══════════════════════════════════════════════════════

  _startEvalPolling() {
    this._stopEvalPolling();
    this._evalTimer = setInterval(() => this._pollEvaluation(), EVAL_POLL_INTERVAL);
  },

  _stopEvalPolling() {
    if (this._evalTimer) {
      clearInterval(this._evalTimer);
      this._evalTimer = null;
    }
  },

  async _pollEvaluation() {
    if (!this.data.sessionId) return;
    D.log('[poll] dialogue_getSession, evaluationStatus:', this.data.evaluationStatus);
    try {
      const res = await studentService.dialogueGetSession({ sessionId: this.data.sessionId });
      D.api('dialogue_getSession', { sessionId: this.data.sessionId }, res);
      if (!res || res.errCode !== 0) return;

      this.setData({ evaluationStatus: res.evaluationStatus });

      if (res.evaluationStatus === 'completed') {
        this._stopEvalPolling();
        const fScore = res.finalScore != null ? Math.round(res.finalScore) : null;
        this.setData({
          finalScore: fScore,
          semanticScore: res.semanticScore,
          avgPronScore: res.avgPronScore,
          semanticBreakdown: res.semanticBreakdown,
          semanticFeedback: res.semanticFeedback,
          expressionsUsed: res.expressionsUsed || [],
          pronResults: res.pronResults || [],
          // Update the main score circle with the formal score
          ...(fScore != null ? { totalScore: fScore, passed: fScore >= 60 } : {}),
        });
      } else if (res.evaluationStatus === 'failed') {
        this._stopEvalPolling();
      }
    } catch (e) {
      console.warn('poll evaluation failed:', e.message);
    }
  },

  // ═══ Voice recording ═══════════════════════════════════════════════════════

  _setupRecorder() {
    recorderManager.onStop((res) => {
      this.setData({ recording: false });
      if (!res.tempFilePath) return;
      console.log('[rec] stopped, file:', res.tempFilePath, 'duration:', res.duration);

      if (!this._ws || !this.data.gatewayReady) {
        wx.showToast({ title: '网关未就绪', icon: 'none' });
        return;
      }

      this._handleVoiceRecording(res.tempFilePath);
    });

    recorderManager.onError((err) => {
      console.error('[rec] error', err);
      this.setData({ recording: false });
      wx.showToast({ title: '录音失败', icon: 'none' });
    });

    recorderManager.onFrameRecorded((res) => {
      // Stream audio chunks to gateway (PCM only — not used in MP3 mode)
      // MP3 mode: we handle the complete file in onStop
    });
  },

  startRecording() {
    if (this.data.sending || this.data.isSessionEnd) return;
    this.setData({ recording: true });
    recorderManager.start({
      format: 'mp3',
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
    });
  },

  stopRecording() {
    if (!this.data.recording) return;
    recorderManager.stop();
    // onStop callback handles the rest
  },

  async _handleVoiceRecording(filePath) {
    D.log('[voice] handling recording, filePath:', filePath);
    const msgs = [...this.data.messages];
    const uid = msgs.length;
    msgs.push({ id: uid, role: 'user', text: '🎤 语音输入…', feedback: '', coachScore: null, _isAudio: true });
    this.setData({ messages: msgs, sending: true });
    this._scrollToBottom();

    try {
      // 1. ASR first — only upload audio if we have text to send
      D.log('[voice] step 1: ASR…');
      const asrText = await this._recognizeSpeech(filePath);
      D.log('[voice] ASR result:', JSON.stringify(asrText));

      if (!asrText) {
        // No ASR — skip upload, switch to text mode
        D.warn('[voice] ASR empty → switching to text mode (no cloud upload)');
        this.setData({ sending: false, voiceMode: false });
        wx.showToast({ title: '语音识别暂不可用，请打字输入', icon: 'none', duration: 2500 });
        const updMsgs2 = [...this.data.messages];
        if (updMsgs2.length && updMsgs2[updMsgs2.length - 1]._isAudio) {
          updMsgs2.pop();
          this.setData({ messages: updMsgs2 });
        }
        return;
      }

      // 2. Upload MP3 to cloud storage (only when we have usable ASR text)
      D.log('[voice] step 2: uploading to cloud storage…');
      const cloudPath = `dialogue_audio/${this.data.sessionId}/${this.data.currentRound + 1}_${Date.now()}.mp3`;
      const uploadRes = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({ cloudPath, filePath, success: resolve, fail: reject });
      });
      const audioFileId = uploadRes.fileID;
      D.log('[voice] step 2: uploaded, fileID:', audioFileId);

      // 3. Track inputMode
      this._lastInputMode = 'voice';
      this._lastAudioFileId = audioFileId;
      this._lastAsrText = asrText;
      this._lastUserText = asrText;

      const updMsgs = [...this.data.messages];
      const userMsg = updMsgs[uid];
      if (userMsg) { userMsg.text = `🎤 ${asrText}`; this.setData({ messages: updMsgs }); }

      // 4. Send to gateway
      D.log('[voice] step 3: sending to gateway, text:', asrText);
      this._ws.send({ data: JSON.stringify({ action: 'textInput', text: asrText }) });
    } catch (e) {
      D.err('[voice] failed:', e.message);
      wx.showToast({ title: '语音处理失败', icon: 'none' });
      this.setData({ sending: false });
    }
  },

  _recognizeSpeech(filePath) {
    // Use WeChat's built-in speech recognition plugin or return empty
    // This is a best-effort ASR — the real scoring uses suntone on the server
    return new Promise((resolve) => {
      const plugin = requirePlugin && typeof requirePlugin === 'function'
        ? null : null; // Plugin not always available
      // Fallback: no client-side ASR, return empty (gateway handles text input)
      // In production, integrate wx speech recognition plugin here
      resolve('');
    });
  },

  // ═══ Text input (fallback) ═══════════════════════════════════════════════════

  toggleInputMode() {
    this.setData({ voiceMode: !this.data.voiceMode });
  },

  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  async sendMessage() {
    const { inputText, isSessionEnd, sending, gatewayReady } = this.data;
    if (!inputText.trim() || isSessionEnd || sending) return;

    const userText = inputText.trim();
    this._lastUserText = userText;
    this._lastInputMode = 'text';
    this._lastAudioFileId = null;
    this._lastAsrText = null;

    // User bubble
    const msgs = [...this.data.messages];
    msgs.push({ id: msgs.length, role: 'user', text: userText, feedback: '', coachScore: null });
    this.setData({ messages: msgs, inputText: '', sending: true });
    this._scrollToBottom();

    if (this._ws && gatewayReady) {
      D.log('[send] via gateway, text:', userText);
      this._ws.send({ data: JSON.stringify({ action: 'textInput', text: userText }) });
    } else {
      D.warn('[send] gateway not ready (wsConnected:', this.data.wsConnected, 'gatewayReady:', gatewayReady, ') → cloud function fallback');
      // Fallback: cloud function
      try {
        const params = { sessionId: this.data.sessionId, userText };
        D.log('[API] dialogue_nextTurn calling…', JSON.stringify(params));
        const res = await studentService.dialogueNextTurn(params);
        D.api('dialogue_nextTurn', params, res);
        if (res && res.errCode === 0) {
          const aiId = this.data.messages.length;
          const newMsgs = [...this.data.messages, {
            id: aiId, role: 'ai', text: res.aiReply,
            feedback: res.aiFeedback || '', coachScore: res.semanticScore,
          }];
          this.setData({
            messages: newMsgs,
            currentRound: res.currentRound,
            isSessionEnd: res.isSessionEnd,
            sending: false,
          });
          if (res.isSessionEnd) {
            this.setData({ totalScore: res.totalScore, passed: !!res.passed, summary: res.summary || '' });
          }
          this._updateDots();
          this._scrollToBottom();
        } else {
          throw new Error(res?.errMsg || '发送失败');
        }
      } catch (e) {
        wx.showToast({ title: e.message || '发送失败', icon: 'none' });
        this.setData({ sending: false });
      }
    }
  },

  // ═══ Session controls ════════════════════════════════════════════════════════

  retrySession() {
    wx.showModal({
      title: '再练一次',
      content: '重新开始这个对话场景吗？',
      confirmText: '开始',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this._closeGateway();
          this._stopEvalPolling();
          this._startSession(this.data.taskItemId);
        }
      }
    });
  },

  goBack() {
    this._closeGateway();
    this._stopEvalPolling();
    wx.navigateBack();
  },

  // ═══ UI helpers ══════════════════════════════════════════════════════════════

  // ═══ Spoiler reveal / replay ═════════════════════════════════════════════════

  revealText(e) {
    this.setData({ revealId: e.currentTarget.dataset.id });
  },

  hideText() {
    this.setData({ revealId: null });
  },

  replayAudio(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    D.log('[audio] replay:', path);
    if (this._audioCtx) {
      try { this._audioCtx.stop(); this._audioCtx.destroy(); } catch {}
    }
    const ctx = wx.createInnerAudioContext();
    ctx.src = path;
    ctx.onError((err) => D.err('[audio] replay error:', err.errMsg));
    ctx.play();
    this._audioCtx = ctx;
  },

  _updateDots() {
    const { maxRounds, currentRound, isSessionEnd } = this.data;
    const dots = Array.from({ length: maxRounds }, (_, i) => {
      if (i < currentRound) return { index: i, state: 'done' };
      if (i === currentRound && !isSessionEnd) return { index: i, state: 'active' };
      return { index: i, state: 'todo' };
    });
    this.setData({ roundDots: dots });
  },

  _scrollToBottom() {
    setTimeout(() => wx.pageScrollTo({ scrollTop: 99999, duration: 250 }), 100);
  }
});
