// cloudfunctions/dialogue_evaluateSession/index.js
// 异步评分：讯飞 suntone 发音评测(voice-only) + 豆包 Ark LLM 语义评分 + 融合
// 环境变量: ASR_APP_ID, ASR_API_KEY, ASR_API_SECRET, ARK_API_KEY, ARK_MODEL_ID
const cloud = require('wx-server-sdk');
const https = require('https');
const crypto = require('crypto');
const WebSocket = require('ws');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CHAIN_TIMEOUT_MS = 15000; // self-chain if approaching cloud function timeout

// ─── Helpers (copied from ai_evaluateSubmission) ────────────────────────────

function pickNum(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === 'number' && !Number.isNaN(v)) return Math.round(v);
  }
  return null;
}

function detectAudioMeta(audioBuffer, audioFileName = '', audioFileId = '') {
  const src = String(audioFileName || audioFileId || '').toLowerCase();
  const byName = src.endsWith('.mp3')
    ? { format: 'mp3', encoding: 'lame', supported: true }
    : src.endsWith('.speex')
      ? { format: 'speex', encoding: 'speex', supported: true }
      : { format: 'unknown', encoding: '', supported: false, reason: 'suntone 仅支持 mp3/speex' };

  if (!audioBuffer || audioBuffer.length < 12) return byName;
  if (audioBuffer.slice(0, 3).toString('ascii') === 'ID3' || (audioBuffer[0] === 0xff && (audioBuffer[1] & 0xe0) === 0xe0)) {
    return { format: 'mp3', encoding: 'lame', supported: true };
  }
  return byName;
}

const SUNTONE_HOST = 'cn-east-1.ws-api.xf-yun.com';

function getSuntoneAuthUrl(path, apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${SUNTONE_HOST}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest();
  const signature = Buffer.from(signatureSha).toString('base64');
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  const params = new URLSearchParams({ authorization, date, host: SUNTONE_HOST });
  return `wss://${SUNTONE_HOST}${path}?${params.toString()}`;
}

async function downloadAudioFromCloud(audioFileId) {
  const tempRes = await cloud.getTempFileURL({
    fileList: [{ fileID: audioFileId, maxAge: 60 * 30 }],
  });
  const file = (tempRes.fileList || [])[0];
  if (!file || !file.tempFileURL || file.status !== 0) {
    throw new Error('获取音频临时链接失败');
  }
  return new Promise((resolve, reject) => {
    const req = https.get(file.tempFileURL, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('下载音频超时')); });
  });
}

async function callSuntone(audioBuffer, refText, audioFileId) {
  const appId = process.env.ASR_APP_ID;
  const apiKey = process.env.ASR_API_KEY;
  const apiSecret = process.env.ASR_API_SECRET;
  if (!appId || !apiKey || !apiSecret) {
    return { error: '未配置 ASR_APP_ID/ASR_API_KEY/ASR_API_SECRET' };
  }
  if (!refText || !refText.trim()) {
    return { error: 'refText 为空' };
  }

  const path = '/v1/private/s8e098720'; // cn+en
  const wsUrl = getSuntoneAuthUrl(path, apiKey, apiSecret);

  return new Promise((resolve) => {
    let finalResult = null;
    let seenResultPayload = false;
    const ws = new WebSocket(wsUrl);

    const parseResultText = (text) => {
      if (!text) return null;
      const decoded = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
      const r = decoded.result || decoded;
      const sent = (Array.isArray(r.sentences) && r.sentences[0]) || r.sentence || r;
      const overall = pickNum(r, 'overall', 'total_score') ?? pickNum(sent, 'overall', 'total_score');
      const fluency = pickNum(r, 'fluency', 'fluency_score') ?? pickNum(sent, 'fluency', 'fluency_score');
      const pronunciation = pickNum(r, 'pronunciation', 'accuracy_score', 'standard_score')
        ?? pickNum(sent, 'pronunciation', 'accuracy_score', 'standard_score');
      const integrity = pickNum(r, 'integrity') ?? pickNum(sent, 'integrity');

      const wordsSrc = r.words || sent.words || [];
      const words = wordsSrc.map((w) => ({
        word: w.word,
        score: pickNum(w.scores, 'overall', 'pronunciation', 'total_score', 'accuracy_score'),
      }));

      const warningsRaw = r.warning;
      const warnings = Array.isArray(warningsRaw) ? warningsRaw : (warningsRaw ? [warningsRaw] : []);
      const noValidAudio = warnings.some((w) => {
        const code = Number(w && w.code);
        const message = w && w.message ? String(w.message) : '';
        return code === 1001 || message.includes('No valid audio');
      });
      const duration = parseFloat(r.numeric_duration || r.duration || 0);
      const hasPositiveScore = [overall, fluency, pronunciation, integrity].some((v) => typeof v === 'number' && v > 0)
        || words.some((w) => typeof w.score === 'number' && w.score > 0);
      if ((noValidAudio && !hasPositiveScore) || (duration <= 0 && !hasPositiveScore)) {
        return { error: 'No valid audio detected' };
      }

      const mainScore = overall ?? pronunciation ?? fluency ?? 70;
      return {
        pronScore: mainScore,
        pronDetails: {
          totalScore: mainScore,
          fluency: fluency ?? mainScore,
          accuracy: pronunciation ?? mainScore,
          integrity: integrity ?? 100,
          words,
        },
      };
    };

    const timeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
      if (!finalResult) resolve({ error: 'suntone 评测超时' });
    }, 30000);

    ws.on('open', () => {
      const audioMeta = detectAudioMeta(audioBuffer, '', audioFileId);
      if (!audioMeta.supported) {
        finalResult = { error: audioMeta.reason || '不支持的音频格式' };
        ws.close();
        return;
      }
      const audioB64 = audioBuffer.toString('base64');
      if (audioB64.length > 10 * 1024 * 1024) {
        finalResult = { error: '音频 base64 超过 10M 限制' };
        ws.close();
        return;
      }
      ws.send(JSON.stringify({
        header: { app_id: appId, status: 2 },
        parameter: {
          st: {
            lang: 'en',
            core: refText.length > 100 ? 'para' : 'sent',
            refText: '\uFEFF' + refText,
            scale: 100,
            result: { encoding: 'utf8', compress: 'raw', format: 'plain' },
          },
        },
        payload: {
          data: {
            encoding: audioMeta.encoding || 'lame',
            sample_rate: 16000,
            channels: 1,
            bit_depth: 16,
            status: 2,
            seq: 0,
            audio: audioB64,
          },
        },
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.header && msg.header.code !== 0) {
          finalResult = { error: msg.header.message || `code ${msg.header.code}` };
          ws.close();
          return;
        }
        const text = msg && msg.payload && msg.payload.result && msg.payload.result.text;
        if (text) {
          seenResultPayload = true;
          try { finalResult = parseResultText(text); }
          catch (e) { finalResult = { error: '解析 suntone 结果失败: ' + e.message }; }
        }
        if (msg.header && msg.header.status === 2) {
          if (!seenResultPayload) console.warn('suntone end frame 未携带 result');
          ws.close();
        }
      } catch (e) {
        finalResult = { error: 'suntone 响应解析失败: ' + e.message };
        ws.close();
      }
    });

    ws.on('error', (err) => {
      if (!finalResult) finalResult = { error: 'suntone 连接失败: ' + err.message };
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(finalResult || { error: 'suntone 未返回有效结果' });
    });
  });
}

// ─── Scene definitions (for targetExpressions lookup) ──────────────────────

const SCENES = {
  scene_checkin: {
    nameZh: '前台入住',
    targetExpressions: [
      'May I have your passport, please?',
      'You have a reservation for X nights.',
      'Your room is on the Xth floor.',
      'Breakfast is served from 6:30 to 10:00.',
      'Enjoy your stay!'
    ]
  },
  scene_complaint: {
    nameZh: '投诉处理',
    targetExpressions: [
      'I sincerely apologize for the inconvenience.',
      'We will send someone to fix it right away.',
      'May I have your room number, please?',
      'Thank you for bringing this to our attention.'
    ]
  },
  scene_service: {
    nameZh: '客房服务',
    targetExpressions: [
      'Room service, how may I help you?',
      'What would you like to order?',
      'It will be delivered in about 30 minutes.',
      'Is there anything else I can help you with?'
    ]
  },
  scene_checkout: {
    nameZh: '退房结账',
    targetExpressions: [
      'Certainly, let me pull up your account.',
      'Your total comes to X yuan.',
      'Would you like to pay by card or cash?',
      'I hope you enjoyed your stay.',
      'Would you need help with your luggage?'
    ]
  },
  scene_directions: {
    nameZh: '问路指引',
    targetExpressions: [
      'It is about X minutes by taxi.',
      'You can also take the shuttle bus.',
      'Would you like me to call a taxi for you?',
      'I would recommend visiting in the morning.',
      'Here is a map for your reference.'
    ]
  },
  scene_reservation: {
    nameZh: '餐厅预约',
    targetExpressions: [
      'For how many guests?',
      'What time would you prefer?',
      'We have a table available at X.',
      'Would you like a window seat?',
      'Your reservation is confirmed.'
    ]
  },
  scene_wake_up: {
    nameZh: '叫醒服务',
    targetExpressions: [
      'What time would you like the wake-up call?',
      'I will set that up for you right away.',
      'Breakfast is served from X to X.',
      'Would you like us to arrange airport transportation?',
      'Have a pleasant journey!'
    ]
  },
  scene_lost_item: {
    nameZh: '失物招领',
    targetExpressions: [
      'I am sorry to hear that. Let me check with our staff.',
      'Could you describe the item?',
      'Where did you last see it?',
      'We found an item matching your description.',
      'Please come to the front desk to collect it.'
    ]
  }
};

// ─── Ark LLM 语义评分 ──────────────────────────────────────────────────────

async function callArkLLM(transcript, sceneId, level, targetExpressions) {
  const apiKey = process.env.ARK_API_KEY;
  const modelId = process.env.ARK_MODEL_ID || 'doubao-pro-32k';
  if (!apiKey) return { error: '未配置 ARK_API_KEY' };

  const exprList = (targetExpressions || [])
    .map((e, i) => `  ${i}. "${e}"`)
    .join('\n');

  const systemPrompt = `你是酒店英语对话质量评估专家。评估学生（酒店前台角色）在完整对话中的表现，按以下维度打分(0-100)。

【评分维度及评分标准】
1. greeting (问候/礼仪, 0-100)
   - 90+: 主动、得体的问候，语气专业礼貌
   - 70-89: 有问候但不够主动或略显生硬
   - 50-69: 问候缺失或用词不当
   - <50: 完全无礼貌或态度差

2. information (信息传递, 0-100)
   - 90+: 准确传达了所有必要信息（房间/楼层/时间/预定等）
   - 70-89: 主要信息传达但有遗漏
   - 50-69: 信息不完整或有误
   - <50: 信息错误或未回应客人需求

3. service (服务意识, 0-100)
   - 90+: 主动提供额外帮助，体现酒店服务精神
   - 70-89: 被动但能完成基本服务
   - 50-69: 服务意识薄弱
   - <50: 应付或冷漠

4. closing (结束语, 0-100)
   - 90+: 恰当的收尾祝福语（如 Enjoy your stay!）
   - 70-89: 有收尾但不够专业
   - <70: 对话突然结束或无收尾

5. fluency (语言流利度, 0-100)
   - 90+: 表达流畅、句子完整、无明显语法错误
   - 70-89: 基本流畅但偶有犹豫或小错
   - 50-69: 句子不完整、明显犹豫("uh","um")、语法差
   - <50: 表达混乱、无法组织完整句子、答非所问

【流利度判断依据】
- 学生的文字来自语音识别(ASR)，请注意ASR痕迹: "uh","um","er"等填充词说明犹豫
- 短句、残句(如"No check in uh I don't know")说明表达能力差
- 答非所问的轮次（AI回复"I didn't quite catch that"）= 学生说的话AI都没懂，流利度和信息传递应大幅扣分
- 语法错误(如"I dont know"省略撇号不扣分，但"No rooms I dont know"这种语序混乱要扣分)

【目标表达检查】(0-based 索引)
学生应尝试使用以下表达（完全匹配或近似均可）:
${exprList}

场景: ${sceneId}，难度等级: ${level}

【注意】
- 答非所问的轮次不计入正面评分，反而应扣分
- semanticScore = (greeting + information + service + closing + fluency) / 5 的综合分

只输出JSON，不要其他内容:
{"semanticScore":75,"breakdown":{"greeting":80,"information":70,"service":75,"closing":75,"fluency":70},"feedback":"中文评语，指出1个优点和1个最需改进的地方，100字以内","expressionsUsed":[0,2]}`;

  const body = JSON.stringify({
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下是完整对话记录:\n\n${transcript}` },
    ],
    temperature: 0.2,
    max_tokens: 600,
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ error: 'Ark LLM 请求超时' }), 30000);

    const req = https.request({
      hostname: 'ark.cn-beijing.volces.com',
      path: '/api/v3/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const resp = JSON.parse(Buffer.concat(chunks).toString());
          const content = resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
          if (!content) return resolve({ error: 'Ark LLM 无返回内容' });
          const parsed = JSON.parse(content);
          resolve({
            semanticScore: Math.min(100, Math.max(0, Number(parsed.semanticScore) || 60)),
            breakdown: parsed.breakdown || {},
            feedback: String(parsed.feedback || '').slice(0, 200),
            expressionsUsed: Array.isArray(parsed.expressionsUsed) ? parsed.expressionsUsed : [],
          });
        } catch (e) {
          resolve({ error: 'Ark LLM 结果解析失败: ' + e.message });
        }
      });
      res.on('error', (e) => { clearTimeout(timeout); resolve({ error: e.message }); });
    });
    req.on('error', (e) => { clearTimeout(timeout); resolve({ error: e.message }); });
    req.write(body);
    req.end();
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

exports.main = async (event) => {
  const { sessionId, startFromTurn = 0 } = event;
  if (!sessionId) return { errCode: -1, errMsg: '缺少 sessionId' };

  const startTime = Date.now();

  try {
    // 1. Load session
    const sessionDoc = await db.collection('dialogue_sessions').doc(sessionId).get();
    if (!sessionDoc.data) return { errCode: -1, errMsg: '会话不存在' };
    const session = sessionDoc.data;

    // Already completed → idempotent exit
    if (session.evaluationStatus === 'completed') {
      console.log('session already evaluated, skipping');
      return { errCode: 0, errMsg: 'already completed' };
    }

    // 2. Optimistic lock: claim running status
    const expectedVersion = session.evaluationVersion || 0;
    try {
      await db.collection('dialogue_sessions').doc(sessionId).update({
        data: {
          evaluationStatus: 'running',
          evaluationVersion: expectedVersion + 1,
          updatedAt: db.serverDate(),
        },
      });
    } catch (e) {
      console.warn('lock contention, another instance may be running:', e.message);
      return { errCode: 0, errMsg: 'lock contention, skipping' };
    }

    const turns = session.turns || [];

    // NOTE: Suntone pronunciation scoring removed for dialogue mode.
    // Reason: refText = ASR output creates circular self-reference (always scores high).
    // Suntone is designed for read-aloud (fixed reference text), not free-form dialogue.
    // Fluency is now evaluated by the LLM based on ASR artifacts.

    // 3. LLM semantic + fluency evaluation — build transcript
    const transcript = turns.map((t) => {
      const prefix = t.round === 0 ? 'AI (guest)' : `Round ${t.round}`;
      const offTopic = t.aiReply && t.aiReply.includes("didn't quite catch that");
      return `[${prefix}]\nStudent: ${t.userText || '(no text)'}${offTopic ? ' ← 答非所问' : ''}\nAI: ${t.aiReply || '(no reply)'}`;
    }).join('\n\n');

    const scene = SCENES[session.sceneId] || {};
    const targetExpressions = scene.targetExpressions || [];

    console.log('[eval] === TRANSCRIPT SENT TO LLM ===\n' + transcript);
    console.log('[eval] targetExpressions:', JSON.stringify(targetExpressions));

    const llmResult = await callArkLLM(transcript, session.sceneId, session.level, targetExpressions);

    console.log('[eval] === LLM RAW RESULT ===', JSON.stringify(llmResult));
    if (llmResult.breakdown) {
      const b = llmResult.breakdown;
      console.log('[eval] breakdown: greeting=%d information=%d service=%d closing=%d fluency=%d',
        b.greeting, b.information, b.service, b.closing, b.fluency);
    }

    let semanticScore = null;
    let semanticBreakdown = null;
    let semanticFeedback = null;
    let expressionsUsed = [];

    if (llmResult.error) {
      console.warn('[eval] Ark LLM evaluation failed:', llmResult.error);
      // Fall back to average coachScore
      const coachScores = turns.map((t) => t.coachScore).filter((s) => typeof s === 'number');
      semanticScore = coachScores.length > 0
        ? Math.round(coachScores.reduce((a, b) => a + b, 0) / coachScores.length)
        : 60;
      semanticFeedback = 'LLM 评分暂不可用，使用练习反馈分作为语义分。';
    } else {
      semanticScore = llmResult.semanticScore;
      semanticBreakdown = llmResult.breakdown;
      semanticFeedback = llmResult.feedback;
      expressionsUsed = llmResult.expressionsUsed;
    }

    // 4. Final score = LLM semantic score (includes fluency)
    const finalScore = semanticScore;

    // 5. Write results
    await db.collection('dialogue_sessions').doc(sessionId).update({
      data: {
        evaluationStatus: 'completed',
        semanticScore,
        semanticBreakdown: semanticBreakdown || {},
        semanticFeedback: semanticFeedback || '',
        expressionsUsed,
        finalScore,
        avgPronScore: null,
        updatedAt: db.serverDate(),
      },
    });

    console.log('evaluation completed:', { sessionId, finalScore, semanticScore });
    return {
      errCode: 0,
      errMsg: 'evaluation completed',
      sessionId,
      finalScore,
      semanticScore,
    };
  } catch (error) {
    console.error('dialogue_evaluateSession error:', error);
    try {
      await db.collection('dialogue_sessions').doc(sessionId).update({
        data: {
          evaluationStatus: 'failed',
          evaluationError: error.message || '评测失败',
          updatedAt: db.serverDate(),
        },
      });
    } catch (e) {
      console.error('update session on error:', e);
    }
    return { errCode: -1, errMsg: error.message || '评测失败' };
  }
};
