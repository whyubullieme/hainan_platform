const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const WebSocket = require('ws');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const XFYUN_HOST = 'tts-api.xfyun.cn';
const XFYUN_PATH = '/v2/tts';
const XFYUN_URL = `wss://${XFYUN_HOST}${XFYUN_PATH}`;

function getXfyunConfig() {
  const appId = (process.env.ASR_APP_ID || process.env.XFYUN_APP_ID || '').trim();
  const apiKey = (process.env.ASR_API_KEY || process.env.XFYUN_API_KEY || '').trim();
  const apiSecret = (process.env.ASR_API_SECRET || process.env.XFYUN_API_SECRET || '').trim();
  const defaultVoice = (process.env.XFYUN_TTS_VCN || 'x4_lingxiaoyan').trim();

  if (!appId || !apiKey || !apiSecret) {
    throw new Error('云函数未配置讯飞密钥（ASR_* 或 XFYUN_*）');
  }
  return { appId, apiKey, apiSecret, defaultVoice };
}

function buildAuthUrl({ apiKey, apiSecret }) {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${XFYUN_HOST}\ndate: ${date}\nGET ${XFYUN_PATH} HTTP/1.1`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64');

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  return `${XFYUN_URL}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${XFYUN_HOST}`;
}

function synthesizeByXfyun({ appId, apiKey, apiSecret, text, voice }) {
  return new Promise((resolve, reject) => {
    const wsUrl = buildAuthUrl({ apiKey, apiSecret });
    const ws = new WebSocket(wsUrl);
    const chunks = [];
    let closed = false;

    const timer = setTimeout(() => {
      if (closed) return;
      closed = true;
      try { ws.terminate(); } catch (e) { }
      reject(new Error('讯飞 TTS 超时，请稍后重试'));
    }, 25000);

    ws.on('open', () => {
      const payload = {
        common: { app_id: appId },
        business: {
          aue: 'lame',
          auf: 'audio/L16;rate=16000',
          vcn: voice,
          tte: 'UTF8',
          speed: 50,
          volume: 50,
          pitch: 50,
        },
        data: {
          status: 2,
          text: Buffer.from(text, 'utf8').toString('base64'),
        },
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
      } catch (e) {
        return;
      }

      if (msg.code !== 0) {
        if (!closed) {
          closed = true;
          clearTimeout(timer);
          try { ws.close(); } catch (e) { }
          reject(new Error(`讯飞 TTS 错误(${msg.code}): ${msg.message || 'unknown'}`));
        }
        return;
      }

      const audioBase64 = msg.data && msg.data.audio ? msg.data.audio : '';
      if (audioBase64) {
        chunks.push(Buffer.from(audioBase64, 'base64'));
      }

      if (msg.data && msg.data.status === 2 && !closed) {
        closed = true;
        clearTimeout(timer);
        try { ws.close(); } catch (e) { }
        resolve(Buffer.concat(chunks));
      }
    });

    ws.on('error', (err) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      reject(new Error(err && err.message ? err.message : '讯飞 TTS 连接失败'));
    });

    ws.on('close', () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error('讯飞 TTS 连接已关闭，未收到音频数据'));
      }
    });
  });
}

async function ensureLogin(openid) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  if (!userRes.data || userRes.data.length === 0) {
    return null;
  }
  return userRes.data[0];
}

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const text = typeof event.text === 'string' ? event.text.trim() : '';
  const voice = typeof event.voice === 'string' ? event.voice.trim() : '';

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份' };
  }
  if (!text) {
    return { errCode: -1, errMsg: '缺少 text' };
  }
  if (text.length > 500) {
    return { errCode: -1, errMsg: 'text 过长，请控制在 500 字符以内' };
  }

  try {
    const user = await ensureLogin(openid);
    if (!user) {
      return { errCode: -1, errMsg: '请先登录' };
    }

    const cfg = getXfyunConfig();
    const finalVoice = voice || cfg.defaultVoice;

    const audioBuffer = await synthesizeByXfyun({
      appId: cfg.appId,
      apiKey: cfg.apiKey,
      apiSecret: cfg.apiSecret,
      text,
      voice: finalVoice,
    });

    if (!audioBuffer || audioBuffer.length === 0) {
      return { errCode: -1, errMsg: '合成失败，未生成音频' };
    }

    const hash = crypto
      .createHash('md5')
      .update(`${finalVoice}|${text}`)
      .digest('hex')
      .slice(0, 16);
    const cloudPath = `tts-audio/xfyun/${Date.now()}_${hash}.mp3`;

    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: audioBuffer,
    });

    if (!uploadRes || !uploadRes.fileID) {
      return { errCode: -1, errMsg: '音频上传失败' };
    }

    const tempRes = await cloud.getTempFileURL({
      fileList: [{ fileID: uploadRes.fileID, maxAge: 60 * 60 }],
    });
    const file = (tempRes.fileList || [])[0] || {};
    const audioUrl = file.tempFileURL || '';

    return {
      errCode: 0,
      errMsg: 'success',
      fileID: uploadRes.fileID,
      audioUrl,
      voice: finalVoice,
    };
  } catch (error) {
    console.error('tts_synthesizeXfyun error:', error);
    return { errCode: -1, errMsg: error.message || '合成失败' };
  }
};
