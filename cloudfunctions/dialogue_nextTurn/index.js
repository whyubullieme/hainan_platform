// cloudfunctions/dialogue_nextTurn/index.js
// Process one student turn via Doubao Realtime Voice WebSocket API
// Env vars: DOUBAO_APP_ID, DOUBAO_ACCESS_TOKEN
const cloud = require('wx-server-sdk');
const WebSocket = require('ws');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ─── Constants ────────────────────────────────────────────────────────────────
const WS_URL        = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
const RESOURCE_ID   = 'volc.speech.dialog';
const FIXED_APP_KEY = 'PlgvMymc7f3tQnJ6';
const DIALOG_MODEL  = '2.2.0.0';
const TIMEOUT_MS    = 6500;
const PASS_LINE     = 60;

const EV = {
  START_CONN:       1,
  CONN_STARTED:     50,
  START_SESSION:    100,
  SESSION_STARTED:  150,
  CHAT_TEXT_QUERY:  501,
  CHAT_RESPONSE:    550,
  CHAT_ENDED:       559,
  FINISH_SESSION:   102,
  FINISH_CONN:      2,
};

// ─── Scene definitions ────────────────────────────────────────────────────────
const SCENES = {
  scene_checkin: {
    nameZh: '前台入住',
    name: 'Hotel Check-in',
    desc: 'A guest arrives at the hotel front desk to check in for the first time.',
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
    name: 'Handling a Complaint',
    desc: 'A guest calls the front desk with a complaint about noise or a broken item in their room.',
    targetExpressions: [
      'I sincerely apologize for the inconvenience.',
      'We will send someone to fix it right away.',
      'May I have your room number, please?',
      'Thank you for bringing this to our attention.'
    ]
  },
  scene_service: {
    nameZh: '客房服务',
    name: 'Room Service',
    desc: 'A guest calls room service to order food or request extra amenities.',
    targetExpressions: [
      'Room service, how may I help you?',
      'What would you like to order?',
      'It will be delivered in about 30 minutes.',
      'Is there anything else I can help you with?'
    ]
  }
};

const LEVEL_DESCS = {
  1: 'Level 1 - 初级 (Beginner): Use simple, slow English. Accept minor grammatical errors if meaning is clear.',
  2: 'Level 2 - 中级 (Intermediate): Standard hotel English. Expect correct common phrases and polite expressions.',
  3: 'Level 3 - 高级 (Advanced): Natural native-speaker pace. Expect professional hotel English.'
};

function getMaxRounds(level) {
  return { 1: 3, 2: 4 }[Number(level)] || 5;
}

function buildSystemRole(scene, level) {
  const levelDesc = LEVEL_DESCS[Number(level)] || LEVEL_DESCS[3];
  const expressions = scene.targetExpressions.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
  return `You are a hotel English speaking coach AND simultaneously playing the role of a hotel guest at a hotel in Hainan, China.

Scene: ${scene.name} — ${scene.desc}
Student Level: ${levelDesc}

As the hotel guest:
- Engage naturally in this scene with concise utterances (1-3 sentences)
- Progress the conversation naturally toward its conclusion

Target expressions the student (front desk staff) should practice:
${expressions}

Scoring guidelines for semanticScore (0-100):
- 90-100: Perfect, professional hotel English
- 70-89: Good with minor errors
- 50-69: Adequate but needs improvement
- 0-49: Incorrect, off-topic, or incomprehensible

CRITICAL: Output ONLY valid JSON in this exact format, no other text:
{"reply":"Your guest utterance in English","feedback":"中文简评：指出优点和一个改进点","semanticScore":75,"isSessionEnd":false,"summary":null}

When the conversation reaches its natural conclusion, set isSessionEnd to true and fill summary with a brief Chinese coaching summary.`;
}

// ─── Binary frame protocol ────────────────────────────────────────────────────
function buildFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.from([0x11, 0x10, 0x40, 0x00]);
  const sizeBytes = Buffer.alloc(4);
  sizeBytes.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, sizeBytes, body]);
}

function parseFrame(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 8) return null;
  const payloadLen = buf.readUInt32BE(4);
  if (buf.length < 8 + payloadLen) return null;
  return JSON.parse(buf.slice(8, 8 + payloadLen).toString('utf8'));
}

// ─── Doubao WebSocket turn (ChatTextQuery flow) ───────────────────────────────
function doubaoNextTurn({ appId, accessToken, dialogId, systemRole, userText, isLastRound }) {
  return new Promise((resolve, reject) => {
    const headers = {
      'X-Api-App-ID':      appId,
      'X-Api-Access-Key':  accessToken,
      'Authorization':     `Bearer; ${accessToken}`,
      'X-Api-Resource-Id': RESOURCE_ID,
      'X-Api-App-Key':     FIXED_APP_KEY,
    };

    const ws = new WebSocket(WS_URL, { headers, handshakeTimeout: 4000 });
    let responseText = '';
    let settled      = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        reject(new Error('豆包 WebSocket 响应超时（12s），请检查网络出站/密钥配置'));
      }
    }, TIMEOUT_MS);

    function done(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.terminate();
      reject(err);
    }

    ws.on('open', () => {
      ws.send(buildFrame({ event: EV.START_CONN, logid: `turn_${Date.now()}` }));
    });

    ws.on('message', (data) => {
      let msg;
      try { msg = parseFrame(data); } catch (e) { return; }
      if (!msg) return;

      switch (msg.event) {
        case EV.CONN_STARTED: {
          // Resume conversation via existing dialog_id
          const sessionPayload = {
            event: EV.START_SESSION,
            dialog: {
              model: DIALOG_MODEL,
              extra: { input_mod: 'text', output_mod: 'text' },
              system_role: systemRole
            }
          };
          if (dialogId) sessionPayload.dialog.dialog_id = dialogId;
          ws.send(buildFrame(sessionPayload));
          break;
        }
        case EV.SESSION_STARTED: {
          // Send user message
          const queryText = isLastRound
            ? `${userText} [This is the final round. Please conclude naturally and provide your summary in the JSON summary field.]`
            : userText;
          ws.send(buildFrame({
            event: EV.CHAT_TEXT_QUERY,
            query: { text: queryText }
          }));
          break;
        }
        case EV.CHAT_RESPONSE: {
          const chunk = msg.response?.text || msg.chat?.text || '';
          if (chunk) responseText += chunk;
          break;
        }
        case EV.CHAT_ENDED: {
          try { ws.send(buildFrame({ event: EV.FINISH_SESSION })); } catch (_) {}
          ws.close();
          done({ responseText: responseText.trim() });
          break;
        }
        case EV.FINISH_CONN: {
          ws.close();
          break;
        }
        default:
          break;
      }
    });

    ws.on('error', (err) => fail(new Error('豆包 WebSocket 错误: ' + err.message)));
    ws.on('close', () => {
      if (!settled) fail(new Error('豆包 WebSocket 意外关闭'));
    });
  });
}

// ─── Parse AI JSON response with fallback ─────────────────────────────────────
function parseAiResponse(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    return {
      aiReply:       String(parsed.reply    || rawText).trim(),
      aiFeedback:    String(parsed.feedback || '').trim(),
      semanticScore: Math.min(100, Math.max(0, Number(parsed.semanticScore) || 60)),
      aiIsEnd:       !!parsed.isSessionEnd,
      aiSummary:     parsed.summary ? String(parsed.summary).trim() : null
    };
  } catch (_) {
    // Model returned plain text — use as reply, apply default score
    return {
      aiReply:       rawText || '...',
      aiFeedback:    '',
      semanticScore: 60,
      aiIsEnd:       false,
      aiSummary:     null
    };
  }
}

function buildMockTurnResult(userText, isLastRound) {
  return {
    aiReply: isLastRound
      ? 'Great practice. Let us wrap up here.'
      : `Thanks. I got it: "${userText.slice(0, 60)}"`,
    aiFeedback: 'Mock 模式：未调用豆包，仅用于联调链路。',
    semanticScore: 75,
    aiIsEnd: !!isLastRound,
    aiSummary: isLastRound ? 'Mock 总结：流程已跑通，可切回真实模型。' : null
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { sessionId, userText } = event;

  if (event && event.debugEnv) {
    const appId       = (process.env.DOUBAO_APP_ID || '').trim();
    const accessToken = (process.env.DOUBAO_ACCESS_TOKEN || '').trim();
    return {
      errCode: 0,
      errMsg: 'env debug',
      cloudEnv: wxContext.ENV || process.env.TCB_ENV || '',
      hasAppId: !!appId,
      hasAccessToken: !!accessToken
    };
  }
  if (!openid)    return { errCode: -1, errMsg: '无法获取用户身份' };
  if (!sessionId) return { errCode: -1, errMsg: '缺少 sessionId' };
  if (!String(userText || '').trim()) return { errCode: -1, errMsg: '缺少 userText' };

  const cleanUserText = String(userText).trim();

  try {
    // 1. Auth
    const userRes = await db.collection('users').where({ openid }).limit(1).get();
    if (!userRes.data || !userRes.data.length) return { errCode: -1, errMsg: '请先登录' };
    const userId = userRes.data[0]._id;

    // 2. Load session
    const sessionDoc = await db.collection('dialogue_sessions').doc(sessionId).get();
    if (!sessionDoc.data) return { errCode: -1, errMsg: '会话不存在' };
    const session = sessionDoc.data;
    if (session.userId !== userId) return { errCode: -1, errMsg: '无权操作此会话' };
    if (session.isSessionEnd) return { errCode: 0, errMsg: '会话已结束', isSessionEnd: true };

    const { sceneId, level, maxRounds, currentRound, turns, doubaoDialogId } = session;
    const scene     = SCENES[sceneId] || SCENES.scene_checkin;
    const nextRound = currentRound + 1;
    const isLastRound = nextRound >= maxRounds;

    // 3. Env vars
    const appId       = (process.env.DOUBAO_APP_ID || '').trim();
    const accessToken = (process.env.DOUBAO_ACCESS_TOKEN || '').trim();
    const useMock = String(process.env.DIALOGUE_MOCK || '') === '1' || !!(event && event.mockMode);
    if (!appId || !accessToken) {
      if (useMock) {
        // allow mock mode without external credentials
      } else {
      return {
        errCode: -1,
        errMsg: '云函数未配置 DOUBAO_APP_ID / DOUBAO_ACCESS_TOKEN',
        cloudEnv: wxContext.ENV || process.env.TCB_ENV || '',
        hasAppId: !!appId,
        hasAccessToken: !!accessToken
      };
      }
    }

    let aiReply;
    let aiFeedback;
    let semanticScore;
    let aiIsEnd;
    let aiSummary;
    if (useMock) {
      ({ aiReply, aiFeedback, semanticScore, aiIsEnd, aiSummary } = buildMockTurnResult(cleanUserText, isLastRound));
    } else {
      // 4. Call Doubao via WebSocket (resume via doubaoDialogId for context)
      const systemRole = buildSystemRole(scene, level);
      const { responseText } = await doubaoNextTurn({
        appId,
        accessToken,
        dialogId: doubaoDialogId || null,
        systemRole,
        userText: cleanUserText,
        isLastRound
      });

      // 5. Parse AI response
      ({ aiReply, aiFeedback, semanticScore, aiIsEnd, aiSummary } = parseAiResponse(responseText));
    }

    // Server enforces round limit — always wins over AI flag
    const isSessionEnd = aiIsEnd || isLastRound;
    const finalScore   = semanticScore;

    // 6. Persist turn
    const newTurn = {
      round: nextRound,
      userText: cleanUserText,
      aiReply,
      aiFeedback,
      semanticScore,
      finalScore,
      timestamp: db.serverDate()
    };

    const updateData = {
      currentRound: nextRound,
      updatedAt: db.serverDate(),
      turns: db.command.push(newTurn)
    };

    let totalScore    = null;
    let passed        = null;
    let sessionSummary = null;

    if (isSessionEnd) {
      const allScores = [...(turns || []).map(t => t.finalScore), finalScore];
      totalScore    = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
      passed        = totalScore >= PASS_LINE;
      sessionSummary = aiSummary
        || `对话完成，综合得分 ${totalScore} 分。${passed ? '继续保持！' : '多加练习，加油！'}`;

      updateData.isSessionEnd = true;
      updateData.totalScore   = totalScore;
      updateData.passed       = passed;
      updateData.summary      = sessionSummary;
    }

    await db.collection('dialogue_sessions').doc(sessionId).update({ data: updateData });

    const response = {
      errCode: 0,
      errMsg: 'success',
      aiReply,
      aiFeedback,
      semanticScore,
      finalScore,
      currentRound: nextRound,
      maxRounds,
      isSessionEnd
    };

    if (isSessionEnd) {
      response.totalScore = totalScore;
      response.passed     = passed;
      response.summary    = sessionSummary;
    }

    return response;
  } catch (error) {
    console.error('dialogue_nextTurn error:', error);
    return { errCode: -1, errMsg: error.message || '处理失败' };
  }
};
