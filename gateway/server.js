// gateway/server.js
// 小程序 ↔ 本网关(WS) ↔ 豆包 Realtime Dialogue WS（长连接复用）
//
// 启动: PORT=3200 DOUBAO_APP_ID=xxx DOUBAO_ACCESS_TOKEN=xxx node server.js
// 测试: wscat -c ws://localhost:3200/ws
// 生产: nginx 做 SSL 终端 → proxy_pass 到 localhost:3200

const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');

// ─── Config ────────────────────────────────────────────────────────────────────
const PORT              = process.env.PORT || 3200;
const DOUBAO_APP_ID     = (process.env.DOUBAO_APP_ID || '').trim();
const DOUBAO_TOKEN      = (process.env.DOUBAO_ACCESS_TOKEN || '').trim();
const DOUBAO_APP_KEY    = (process.env.DOUBAO_APP_KEY || 'PlgvMymc7f3tQnJ6').trim();
const DOUBAO_INPUT_MOD  = (process.env.DOUBAO_INPUT_MOD || 'text').trim();

const DOUBAO_WS_URL     = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
const DOUBAO_RESOURCE   = 'volc.speech.dialog';
const DOUBAO_MODEL      = '1.2.1.1';   // O version — supports system_role
const CONNECT_TIMEOUT   = 15000;

// ─── Doubao event codes ────────────────────────────────────────────────────────
const EV = {
  // Client → Server
  START_CONN:      1,
  FINISH_CONN:     2,
  START_SESSION:   100,
  FINISH_SESSION:  102,
  TASK_REQUEST:    200,
  SAY_HELLO:       300,
  END_ASR:         400,
  CHAT_TEXT_QUERY: 501,
  // Server → Client
  CONN_STARTED:    50,
  SESSION_STARTED: 150,
  SESSION_USAGE:   154,
  TTS_SENTENCE_START: 350,
  TTS_SENTENCE_END:   351,
  TTS_RESPONSE:    352,
  TTS_REPLY_END:   359,
  CHAT_RESPONSE:   550,
  CHAT_ENDED:      559,
};

// ─── Scene definitions ─────────────────────────────────────────────────────────
const SCENES = {
  scene_checkin: {
    nameZh: '前台入住', name: 'Hotel Check-in',
    desc: 'A guest arrives at the hotel front desk to check in for the first time.',
    firstGreeting: 'Hi, good morning! I have a reservation under the name Johnson. I would like to check in, please.',
    targetExpressions: [
      'May I have your passport, please?',
      'You have a reservation for X nights.',
      'Your room is on the Xth floor.',
      'Breakfast is served from 6:30 to 10:00.',
      'Enjoy your stay!'
    ]
  },
  scene_complaint: {
    nameZh: '投诉处理', name: 'Handling a Complaint',
    desc: 'A guest calls the front desk with a complaint about noise or a broken item in their room.',
    firstGreeting: 'Excuse me, I need to talk to someone about my room. The air conditioning is not working and it is very hot.',
    targetExpressions: [
      'I sincerely apologize for the inconvenience.',
      'We will send someone to fix it right away.',
      'May I have your room number, please?',
      'Thank you for bringing this to our attention.'
    ]
  },
  scene_service: {
    nameZh: '客房服务', name: 'Room Service',
    desc: 'A guest calls room service to order food or request extra amenities.',
    firstGreeting: 'Hello, is this room service? I would like to order some food to my room, please.',
    targetExpressions: [
      'Room service, how may I help you?',
      'What would you like to order?',
      'It will be delivered in about 30 minutes.',
      'Is there anything else I can help you with?'
    ]
  },
  scene_checkout: {
    nameZh: '退房结账', name: 'Hotel Check-out',
    desc: 'A guest comes to the front desk to check out and settle the bill.',
    firstGreeting: 'Good morning, I would like to check out, please. My room number is 1208.',
    targetExpressions: [
      'Certainly, let me pull up your account.',
      'Your total comes to X yuan.',
      'Would you like to pay by card or cash?',
      'I hope you enjoyed your stay.',
      'Would you need help with your luggage?'
    ]
  },
  scene_directions: {
    nameZh: '问路指引', name: 'Giving Directions',
    desc: 'A guest asks the concierge for directions to a nearby attraction or restaurant.',
    firstGreeting: 'Hi, could you tell me how to get to Wanning Beach from here? I heard it is beautiful.',
    targetExpressions: [
      'It is about X minutes by taxi.',
      'You can also take the shuttle bus.',
      'Would you like me to call a taxi for you?',
      'I would recommend visiting in the morning.',
      'Here is a map for your reference.'
    ]
  },
  scene_reservation: {
    nameZh: '餐厅预约', name: 'Restaurant Reservation',
    desc: 'A guest wants to make a reservation at the hotel restaurant.',
    firstGreeting: 'Hi, I would like to book a table at your seafood restaurant for tonight. There will be four of us.',
    targetExpressions: [
      'For how many guests?',
      'What time would you prefer?',
      'We have a table available at X.',
      'Would you like a window seat?',
      'Your reservation is confirmed.'
    ]
  },
  scene_wake_up: {
    nameZh: '叫醒服务', name: 'Wake-up Call',
    desc: 'A guest calls the front desk to request a wake-up call and ask about breakfast hours.',
    firstGreeting: 'Hello, I have an early flight tomorrow. Could I get a wake-up call?',
    targetExpressions: [
      'What time would you like the wake-up call?',
      'I will set that up for you right away.',
      'Breakfast is served from X to X.',
      'Would you like us to arrange airport transportation?',
      'Have a pleasant journey!'
    ]
  },
  scene_lost_item: {
    nameZh: '失物招领', name: 'Lost and Found',
    desc: 'A guest reports a lost item and asks the hotel for help finding it.',
    firstGreeting: 'Excuse me, I think I left my wallet in the lobby restaurant about an hour ago. Can you help me find it?',
    targetExpressions: [
      'I am sorry to hear that. Let me check with our staff.',
      'Could you describe the item?',
      'Where did you last see it?',
      'We found an item matching your description.',
      'Please come to the front desk to collect it.'
    ]
  }
};

const LEVEL_DESCS = {
  1: 'Level 1 - 初级 (Beginner): Use simple, slow English.',
  2: 'Level 2 - 中级 (Intermediate): Standard hotel English.',
  3: 'Level 3 - 高级 (Advanced): Natural native-speaker pace.'
};

function getMaxRounds(level) {
  return { 1: 3, 2: 4 }[Number(level)] || 5;
}

function buildSystemRole(scene, level) {
  const maxRounds = getMaxRounds(level);
  return `You are a hotel guest at a hotel in Hainan, China. The student is the hotel front desk staff.

Scene: ${scene.name} — ${scene.desc}

Rules:
- Speak ONLY English, as a natural hotel guest. Stay in character at all times.
- Keep each response concise: 1-3 natural sentences.
- Progress the conversation naturally through the scene.
- If the student's reply is completely incomprehensible, say: "I'm sorry, I didn't quite catch that. Could you say that again?"
- After the student has responded ${maxRounds} times, your final reply MUST end with the exact marker: [END]
  Example: "Thank you so much for your help, I appreciate it! [END]"

IMPORTANT: Output ONLY the guest's spoken English. No JSON, no Chinese, no scores, no coaching.`;
}

// ─── Doubao binary frame protocol (official spec) ────────────────────────────
//
// Frame layout:
//   [4-byte header]
//   [4-byte event_id]                     ← flags bit2 = has event
//   [4-byte session_id_size + sid bytes]   ← for session events (event >= 100)
//   [4-byte payload_size]
//   [payload bytes]
//
// Header bytes:
//   byte0: version:4 | hdrSize:4    → 0x11 (version=1, hdrSize=1 = 4 bytes)
//   byte1: msgType:4 | flags:4      → 0x14 (full_client_req=0001, flags=0100=has_event)
//   byte2: serial:4  | compress:4   → 0x10 (JSON=1, no_compress=0)
//   byte3: reserved                  → 0x00
//
// Official StartConnection example (decimal bytes):
//   [17 20 16 0  0 0 0 1  0 0 0 2  123 125]
//    header(4) + event=1(4) + payloadSize=2(4) + "{}"(2)

function generateSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Build a binary event frame per official Doubao protocol.
 * @param {number} eventId - Event code (e.g. EV.START_CONN=1, EV.START_SESSION=100)
 * @param {string|null} sessionId - UUID session ID (included for session events >=100)
 * @param {object} payload - JSON payload
 */
function buildEventFrame(eventId, sessionId, payload) {
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const parts = [];

  // 4-byte header
  parts.push(Buffer.from([0x11, 0x14, 0x10, 0x00]));

  // 4-byte event ID
  const evBuf = Buffer.alloc(4);
  evBuf.writeUInt32BE(eventId, 0);
  parts.push(evBuf);

  // Session ID for session-level events (event >= 100)
  if (eventId >= 100 && sessionId) {
    const sidBuf = Buffer.from(sessionId, 'utf8');
    const sidSizeBuf = Buffer.alloc(4);
    sidSizeBuf.writeUInt32BE(sidBuf.length, 0);
    parts.push(sidSizeBuf);
    parts.push(sidBuf);
  }

  // 4-byte payload size + payload
  const szBuf = Buffer.alloc(4);
  szBuf.writeUInt32BE(payloadBuf.length, 0);
  parts.push(szBuf);
  parts.push(payloadBuf);

  return Buffer.concat(parts);
}

/**
 * Parse a binary frame from Doubao server.
 */
function parseFrame(raw) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length < 4) {
    try { return { kind: 'json', eventId: null, data: JSON.parse(buf.toString('utf8')) }; }
    catch { return null; }
  }

  const msgType  = (buf[1] >> 4) & 0x0F;
  const flags    = buf[1] & 0x0F;
  const serial   = (buf[2] >> 4) & 0x0F;
  const compress = buf[2] & 0x0F;

  let offset = 4;
  let eventId = null;
  let sessionId = null;

  // flags bit 2 (0x04): has event_id
  if (flags & 0x04) {
    if (buf.length < offset + 4) return null;
    eventId = buf.readUInt32BE(offset);
    offset += 4;

    // After event_id, there is always an optional ID field:
    // - Connection events (< 100): connect_id_size + connect_id
    // - Session events (>= 100): session_id_size + session_id
    if (buf.length >= offset + 4) {
      const idSize = buf.readUInt32BE(offset);
      if (idSize > 0 && idSize < 256 && buf.length >= offset + 4 + idSize) {
        offset += 4;
        const idStr = buf.slice(offset, offset + idSize).toString('utf8');
        offset += idSize;
        if (eventId >= 100) sessionId = idStr;
      }
    }
  }

  // Read payload_size + payload
  if (buf.length < offset + 4) {
    if (msgType === 0x0B && serial === 0) {
      return { kind: 'audio', eventId, data: buf.slice(offset) };
    }
    return null;
  }

  const payloadSize = buf.readUInt32BE(offset);
  offset += 4;

  if (buf.length < offset + payloadSize) {
    console.log('[doubao] payload truncated: expected=%d available=%d', payloadSize, buf.length - offset);
    return null;
  }
  const payload = buf.slice(offset, offset + payloadSize);

  // Error frame (msgType 0x0F)
  if (msgType === 0x0F) {
    const text = payload.toString('utf8');
    console.error('[doubao] ERROR event=%d: %s', eventId, text.slice(0, 300));
    try { return { kind: 'error', eventId, data: JSON.parse(text) }; }
    catch { return { kind: 'error', eventId, data: text }; }
  }

  // Audio response (msgType 0x0B, serial 0)
  if (msgType === 0x0B || (serial === 0 && msgType !== 0x09)) {
    return { kind: 'audio', eventId, data: payload };
  }

  // JSON response — handle possible gzip compression
  if (serial === 1) {
    let jsonBuf = payload;
    if (compress === 1) {
      try {
        const zlib = require('zlib');
        jsonBuf = zlib.gunzipSync(payload);
      } catch (e) {
        console.error('[doubao] gzip decompress failed:', e.message);
      }
    }
    const text = jsonBuf.toString('utf8');
    try { return { kind: 'json', eventId, sessionId, data: JSON.parse(text) }; }
    catch (e) {
      console.error('[doubao] JSON parse failed: %s raw: %s', e.message, text.slice(0, 200));
      return { kind: 'raw', eventId, msgType, serial, data: payload };
    }
  }

  return { kind: 'raw', msgType, serial, eventId, data: payload };
}

// ─── Parse AI response — plain English with optional [END] marker ──────────────
function parseAiResponse(text) {
  const isSessionEnd = text.includes('[END]');
  const aiReply = text.replace(/\[END\]/g, '').trim();
  return {
    aiReply,
    aiFeedback:   '',
    coachScore:   null,   // no inline scoring — formal evaluation happens async
    isSessionEnd,
    summary:      null
  };
}

// ─── DoubaoSession — one persistent WS per dialogue session ────────────────────
class DoubaoSession {
  constructor(systemRole, inputMod) {
    this.systemRole = systemRole;
    this.inputMod   = inputMod;   // 'text' | 'audio'
    this.ws         = null;
    this.sessionId  = generateSessionId();
    this.dialogId   = null;
    this.responseText = '';
    this._chatEndedFired = false;   // dedup: ChatEnded(559) vs TTS_REPLY_END(359)
    this._gotChatResponse = false;  // dedup: skip TTS text when ChatResponse active
    this.listeners  = { event: null, audio: null, error: null, close: null };
  }

  on(evt, fn) { this.listeners[evt] = fn; }
  _emit(evt, ...args) { if (this.listeners[evt]) this.listeners[evt](...args); }

  connect() {
    return new Promise((resolve, reject) => {
      const connectId = `gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const headers = {
        'X-Api-App-ID':      DOUBAO_APP_ID,
        'X-Api-Access-Key':  DOUBAO_TOKEN,
        'X-Api-Resource-Id': DOUBAO_RESOURCE,
        'X-Api-App-Key':     DOUBAO_APP_KEY,
        'X-Api-Connect-Id':  connectId,
      };
      console.log('[doubao] connecting with headers:', JSON.stringify({
        'X-Api-App-ID': DOUBAO_APP_ID,
        'X-Api-Resource-Id': DOUBAO_RESOURCE,
        'X-Api-App-Key': DOUBAO_APP_KEY,
        'X-Api-Connect-Id': connectId,
        'X-Api-Access-Key': DOUBAO_TOKEN ? `${DOUBAO_TOKEN.slice(0,4)}...` : 'MISSING',
      }));
      console.log('[doubao] sessionId=%s model=%s input_mod=%s', this.sessionId, DOUBAO_MODEL, this.inputMod);

      this.ws = new WebSocket(DOUBAO_WS_URL, { headers, handshakeTimeout: 10000 });

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; this.ws.terminate(); reject(new Error('doubao handshake timeout')); }
      }, CONNECT_TIMEOUT);

      this.ws.on('open', () => {
        console.log('[doubao] ws open → START_CONN');
        this.ws.send(buildEventFrame(EV.START_CONN, null, {}));
      });

      this.ws.on('message', (raw) => {
        const f = parseFrame(raw);
        if (!f) {
          console.log('[doubao] unparseable frame len=%d', raw.length);
          return;
        }

        if (f.kind === 'audio') {
          console.log('[doubao] ◀ audio chunk %d bytes event=%s', f.data.length, f.eventId);
          this._emit('audio', f.data);
          return;
        }
        if (f.kind === 'error') {
          console.error('[doubao] ◀ ERROR event=%s:', f.eventId, JSON.stringify(f.data));
          const err = new Error('doubao error: ' + JSON.stringify(f.data));
          if (!settled) { settled = true; clearTimeout(timer); reject(err); }
          this._emit('error', err);
          return;
        }
        if (f.kind === 'raw') {
          console.log('[doubao] ◀ raw frame msgType=0x%s serial=%d len=%d',
            f.msgType?.toString(16), f.serial, f.data?.length);
          return;
        }

        // JSON event
        const msg = f.data;
        const eventId = f.eventId;
        console.log('[doubao] ◀ event=%d json=%s', eventId, JSON.stringify(msg).slice(0, 300));

        switch (eventId) {
          case EV.CONN_STARTED: {
            console.log('[doubao] CONN_STARTED → START_SESSION');
            const payload = {
              dialog: {
                bot_name: 'Hotel Coach',
                dialog_id: '',
                system_role: this.systemRole,
                extra: {
                  input_mod: this.inputMod,
                  model: DOUBAO_MODEL
                }
              }
            };
            this.ws.send(buildEventFrame(EV.START_SESSION, this.sessionId, payload));
            break;
          }

          case EV.SESSION_STARTED: {
            this.dialogId = msg.dialog?.dialog_id || f.sessionId || null;
            console.log('[doubao] SESSION_STARTED dialogId=%s', this.dialogId);
            if (!settled) { settled = true; clearTimeout(timer); resolve(); }
            break;
          }

          case EV.CHAT_RESPONSE: {
            // Official payload: {"content": "AI text", "question_id": "...", "reply_id": "..."}
            this._gotChatResponse = true;
            const chunk = msg.content || msg.response?.text || msg.chat?.text || '';
            if (chunk) {
              this.responseText += chunk;
              this._emit('event', { type: 'aiChunk', text: chunk });
            }
            break;
          }

          case EV.CHAT_ENDED: {
            const full = this.responseText.trim();
            console.log('[doubao] CHAT_ENDED len=%d', full.length);
            this._chatEndedFired = true;
            this._emit('event', { type: 'chatEnded', responseText: full });
            this.responseText = '';
            break;
          }

          case EV.TTS_SENTENCE_START:
            console.log('[doubao] TTS sentence start');
            break;

          case EV.TTS_SENTENCE_END: {
            // event 351: TTS text. Only use for greeting (when no ChatResponse received).
            const text = msg.text || '';
            if (text && !this._chatEndedFired && !this._gotChatResponse) {
              this.responseText += text.replace(/\n$/, '');
              this._emit('event', { type: 'aiChunk', text: text.replace(/\n$/, '') });
            }
            break;
          }

          case EV.TTS_REPLY_END: {
            // event 359: reply complete. Only emit if ChatEnded(559) didn't fire first.
            if (!this._chatEndedFired) {
              const full = this.responseText.trim();
              if (full) {
                console.log('[doubao] TTS reply end len=%d', full.length);
                this._emit('event', { type: 'chatEnded', responseText: full });
                this.responseText = '';
              }
            }
            // Signal audio stream complete (client plays accumulated TTS audio)
            this._emit('event', { type: 'audioEnd' });
            // Reset all dedup flags for next response cycle
            this._chatEndedFired = false;
            this._gotChatResponse = false;
            break;
          }

          case EV.SESSION_USAGE:
            console.log('[doubao] usage:', JSON.stringify(msg).slice(0, 200));
            break;

          default:
            console.log('[doubao] unhandled event=%d', eventId);
            this._emit('event', { type: 'unknown', eventId, raw: msg });
            break;
        }
      });

      this.ws.on('unexpected-response', (req, res) => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString().slice(0, 300);
          console.error('[doubao] HTTP %d unexpected-response: %s', res.statusCode, body);
          const err = new Error(`doubao HTTP ${res.statusCode}: ${body}`);
          if (!settled) { settled = true; clearTimeout(timer); reject(err); }
        });
      });

      this.ws.on('error', (err) => {
        console.error('[doubao] ws error:', err.message);
        if (!settled) { settled = true; clearTimeout(timer); reject(err); }
        this._emit('error', err);
      });

      this.ws.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString('utf8') : '';
        console.log('[doubao] ws closed code=%d reason="%s"', code, reasonStr);
        if (!settled) {
          settled = true; clearTimeout(timer);
          reject(new Error(`doubao ws closed: code=${code} reason=${reasonStr}`));
        }
        this._emit('close');
      });
    });
  }

  sayHello(content) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = content ? { content } : {};
      console.log('[doubao] ▶ SAY_HELLO payload=%s', JSON.stringify(payload));
      this.ws.send(buildEventFrame(EV.SAY_HELLO, this.sessionId, payload));
    }
  }

  sendText(text) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[doubao] ▶ CHAT_TEXT_QUERY len=%d', text.length);
      this.ws.send(buildEventFrame(EV.CHAT_TEXT_QUERY, this.sessionId, { content: text }));
    }
  }

  sendAudio(pcm, last = false) {
    // Audio mode: TODO when needed
    // Would use msgType=0b0010, event=TASK_REQUEST(200), then raw audio frames
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[doubao] sendAudio not yet implemented for binary protocol');
    }
  }

  close() {
    if (!this.ws) return;
    try {
      this.ws.send(buildEventFrame(EV.FINISH_SESSION, this.sessionId, {}));
    } catch {}
    try {
      this.ws.send(buildEventFrame(EV.FINISH_CONN, null, {}));
    } catch {}
    try { this.ws.close(); } catch {}
    this.ws = null;
  }
}

// ─── HTTP health-check ─────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, sessions: clients.size }));
  }
  res.writeHead(404); res.end();
});

// ─── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map();   // clientId → { doubao, turnCount }

function handleConnection(ws) {
  const cid = `c${Date.now().toString(36)}`;
  let doubao = null;
  let turnCount = 0;
  let awaitingGreeting = false;

  console.log(`[${cid}] client connected`);

  const send = (obj) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  // ── handle Doubao events → forward to client ────────────────────────────
  function attachDoubaoListeners(d) {
    d.on('event', (evt) => {
      if (evt.type === 'aiChunk') {
        send({ type: 'aiChunk', text: evt.text });
      } else if (evt.type === 'chatEnded') {
        if (awaitingGreeting) {
          awaitingGreeting = false;
          send({ type: 'greeting', text: evt.responseText });
        } else {
          turnCount++;
          const parsed = parseAiResponse(evt.responseText);
          send({ type: 'turnComplete', round: turnCount, rawText: evt.responseText, ...parsed });
        }
      } else if (evt.type === 'audioEnd') {
        send({ type: 'audioEnd' });  // client plays accumulated TTS audio
      }
    });
    d.on('audio', (buf) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(buf);   // binary TTS frame
    });
    d.on('error', (err) => send({ type: 'error', message: err.message }));
    d.on('close', () => send({ type: 'doubaoDisconnected' }));
  }

  // ── handle client messages ──────────────────────────────────────────────
  ws.on('message', async (data, isBinary) => {
    // Binary → audio chunk, forward to Doubao
    if (isBinary) {
      if (doubao) doubao.sendAudio(Buffer.from(data));
      return;
    }

    let msg;
    try { msg = JSON.parse(data.toString()); } catch {
      return send({ type: 'error', message: 'invalid JSON' });
    }

    console.log(`[${cid}] action=${msg.action}`);

    switch (msg.action) {
      case 'startSession': {
        const scene = SCENES[msg.sceneId] || SCENES.scene_checkin;
        const level = Number(msg.level) || 1;
        const sysRole = buildSystemRole(scene, level);
        turnCount = 0;

        doubao = new DoubaoSession(sysRole, DOUBAO_INPUT_MOD);
        attachDoubaoListeners(doubao);
        clients.set(cid, { doubao, turnCount });

        try {
          await doubao.connect();
          send({ type: 'sessionReady', dialogId: doubao.dialogId });
          // AI (guest) speaks first with scene-specific greeting
          awaitingGreeting = true;
          doubao.sayHello(scene.firstGreeting || 'Hello');
        } catch (e) {
          send({ type: 'error', message: 'doubao connect failed: ' + e.message });
          doubao = null;
          clients.delete(cid);
        }
        break;
      }

      case 'textInput': {
        if (!doubao) return send({ type: 'error', message: 'no active session' });
        doubao.responseText = '';
        doubao._chatEndedFired = false;
        doubao._gotChatResponse = false;
        doubao.sendText(String(msg.text || '').trim());
        break;
      }

      case 'endAudio': {
        if (doubao) doubao.sendAudio(Buffer.alloc(0), true);
        break;
      }

      case 'endSession': {
        if (doubao) { doubao.close(); doubao = null; clients.delete(cid); }
        send({ type: 'sessionClosed' });
        break;
      }

      default:
        send({ type: 'error', message: `unknown action: ${msg.action}` });
    }
  });

  ws.on('close', () => {
    console.log(`[${cid}] client disconnected`);
    if (doubao) { doubao.close(); clients.delete(cid); }
  });
}

wss.on('connection', handleConnection);

// ─── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\ndialogue-gateway on port ${PORT}`);
  console.log(`  health → http://localhost:${PORT}/health`);
  console.log(`  ws     → ws://localhost:${PORT}/ws`);
  console.log(`  DOUBAO_APP_ID      : ${DOUBAO_APP_ID ? 'OK' : 'MISSING'}`);
  console.log(`  DOUBAO_ACCESS_TOKEN: ${DOUBAO_TOKEN ? 'OK' : 'MISSING'}`);
  console.log(`  DOUBAO_APP_KEY     : ${DOUBAO_APP_KEY}`);
  console.log(`  MODEL              : ${DOUBAO_MODEL}`);
  console.log(`  INPUT_MOD          : ${DOUBAO_INPUT_MOD}\n`);
});
