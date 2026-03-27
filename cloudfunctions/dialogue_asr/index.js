// cloudfunctions/dialogue_asr/index.js
// 讯飞语音听写 (IAT) — 接收 base64 音频，返回识别文字
// 环境变量: ASR_APP_ID, ASR_API_KEY, ASR_API_SECRET
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const WebSocket = require('ws');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const IAT_HOST = 'iat-api.xfyun.cn';
const IAT_PATH = '/v2/iat';

/**
 * 生成讯飞 WebSocket 鉴权 URL
 */
function getAuthUrl(apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${IAT_HOST}\ndate: ${date}\nGET ${IAT_PATH} HTTP/1.1`;
  const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest();
  const signature = Buffer.from(signatureSha).toString('base64');
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  const params = new URLSearchParams({ authorization, date, host: IAT_HOST });
  return `wss://${IAT_HOST}${IAT_PATH}?${params.toString()}`;
}

/**
 * 调用讯飞语音听写，返回识别文字
 * @param {Buffer} audioBuffer - 音频数据
 * @param {string} encoding - 'lame' (mp3) | 'raw' (pcm) | 'speex-wb'
 * @param {string} lang - 'en_us' | 'zh_cn'
 */
function recognizeSpeech(audioBuffer, encoding = 'lame', lang = 'en_us') {
  const appId = process.env.ASR_APP_ID;
  const apiKey = process.env.ASR_API_KEY;
  const apiSecret = process.env.ASR_API_SECRET;
  if (!appId || !apiKey || !apiSecret) {
    return Promise.reject(new Error('未配置 ASR_APP_ID/ASR_API_KEY/ASR_API_SECRET'));
  }

  const url = getAuthUrl(apiKey, apiSecret);
  const CHUNK_SIZE = 9000; // ~12000 base64 chars, under 13000 limit

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const results = [];  // collect all result segments
    let timeout;

    const cleanup = () => {
      clearTimeout(timeout);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error('ASR timeout (15s)'));
    }, 15000);

    ws.on('open', () => {
      console.log('[asr] ws connected, sending audio', audioBuffer.length, 'bytes, encoding:', encoding);
      let offset = 0;
      let frameIndex = 0;

      const sendChunk = () => {
        if (offset >= audioBuffer.length) {
          // Send last frame (status=2)
          ws.send(JSON.stringify({ data: { status: 2, format: 'audio/L16;rate=16000', encoding, audio: '' } }));
          return;
        }

        const end = Math.min(offset + CHUNK_SIZE, audioBuffer.length);
        const chunk = audioBuffer.slice(offset, end);
        const status = frameIndex === 0 ? 0 : 1;

        const frame = {
          data: {
            status,
            format: 'audio/L16;rate=16000',
            encoding,
            audio: chunk.toString('base64'),
          },
        };

        // First frame includes common + business params
        if (status === 0) {
          frame.common = { app_id: appId };
          frame.business = {
            language: lang,
            domain: 'iat',
            accent: lang === 'en_us' ? 'mandarin' : 'mandarin',
            vad_eos: 3000,
            ptt: 0,  // no punctuation for scoring purposes
          };
        }

        ws.send(JSON.stringify(frame));
        offset = end;
        frameIndex++;

        // Send next chunk after a small delay (40ms mimics real-time)
        if (offset < audioBuffer.length) {
          setTimeout(sendChunk, 40);
        } else {
          // All data sent, send end frame
          setTimeout(() => {
            ws.send(JSON.stringify({ data: { status: 2, format: 'audio/L16;rate=16000', encoding, audio: '' } }));
          }, 40);
        }
      };

      sendChunk();
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.code !== 0) {
          console.error('[asr] error:', msg.code, msg.message);
          cleanup();
          reject(new Error(`ASR error ${msg.code}: ${msg.message}`));
          return;
        }

        if (msg.data && msg.data.result) {
          const words = (msg.data.result.ws || [])
            .map(w => (w.cw || []).map(c => c.w).join(''))
            .join('');
          if (words) results.push(words);
        }

        // status=2 means final result
        if (msg.data && msg.data.status === 2) {
          const text = results.join('').trim();
          console.log('[asr] final result:', JSON.stringify(text));
          cleanup();
          resolve(text);
        }
      } catch (e) {
        console.error('[asr] parse error:', e.message);
      }
    });

    ws.on('error', (err) => {
      console.error('[asr] ws error:', err.message);
      cleanup();
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      // If we haven't resolved yet, resolve with what we have
      if (results.length) {
        resolve(results.join('').trim());
      }
    });
  });
}

exports.main = async (event) => {
  const { audioBase64, encoding = 'lame', lang = 'en_us' } = event;

  if (!audioBase64) {
    return { errCode: -1, errMsg: 'missing audioBase64' };
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    console.log('[asr] received audio:', audioBuffer.length, 'bytes, encoding:', encoding, 'lang:', lang);

    const text = await recognizeSpeech(audioBuffer, encoding, lang);
    console.log('[asr] result:', JSON.stringify(text));
    return { errCode: 0, errMsg: 'success', text };
  } catch (e) {
    console.error('[asr] failed:', e.message);
    return { errCode: -1, errMsg: e.message, text: '' };
  }
};
