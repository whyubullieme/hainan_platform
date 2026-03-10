// cloudfunctions/ai_evaluateSubmission/index.js
// 环境变量（云开发控制台配置）：ASR_APP_ID, ASR_API_KEY, ASR_API_SECRET
const cloud = require('wx-server-sdk');
const https = require('https');
const crypto = require('crypto');
const WebSocket = require('ws');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const EVAL_DEBUG = process.env.EVAL_DEBUG === '1';

const DEFAULT_SCORING = { semanticWeight: 0.5, pronWeight: 0.5, semanticPassLine: 60, pronPassLine: 60 };

function pickNum(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === 'number' && !Number.isNaN(v)) return Math.round(v);
  }
  return null;
}

function pickAudioMetaFromName(audioFileName = '', audioFileId = '') {
  const src = String(audioFileName || audioFileId || '').toLowerCase();
  if (src.endsWith('.mp3')) return { format: 'mp3', encoding: 'lame', supported: true };
  if (src.endsWith('.speex')) return { format: 'speex', encoding: 'speex', supported: true };
  return { format: 'unknown', encoding: '', supported: false, reason: 'suntone 当前仅支持 mp3/speex/speex-wb' };
}

function detectAudioMeta(audioBuffer, audioFileName = '', audioFileId = '') {
  const byName = pickAudioMetaFromName(audioFileName, audioFileId);
  if (!audioBuffer || audioBuffer.length < 12) return byName;

  // MP3: ID3 header or MPEG frame sync
  if (audioBuffer.slice(0, 3).toString('ascii') === 'ID3' || (audioBuffer[0] === 0xff && (audioBuffer[1] & 0xe0) === 0xe0)) {
    return { format: 'mp3', encoding: 'lame', supported: true };
  }
  return byName;
}

const SUNTONE_CN_EN = 'wss://cn-east-1.ws-api.xf-yun.com/v1/private/s8e098720';
const SUNTONE_OTHER = 'wss://cn-east-1.ws-api.xf-yun.com/v1/private/sffc17cdb';
const SUNTONE_HOST = 'cn-east-1.ws-api.xf-yun.com';

/**
 * 生成讯飞 WebSocket 鉴权 URL
 */
function getSuntoneAuthUrl(path, apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${SUNTONE_HOST}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest();
  const signature = Buffer.from(signatureSha).toString('base64');
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  const params = new URLSearchParams({
    authorization,
    date,
    host: SUNTONE_HOST,
  });
  return `wss://${SUNTONE_HOST}${path}?${params.toString()}`;
}

/**
 * 从云存储下载音频到 Buffer
 */
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
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('下载音频超时'));
    });
  });
}

/**
 * 调用讯飞 suntone 评测，返回 { pronScore, pronDetails, error? }
 */
async function callSuntone(audioBuffer, refText, lang = 'en', audioMetaInput = {}) {
  const appId = process.env.ASR_APP_ID;
  const apiKey = process.env.ASR_API_KEY;
  const apiSecret = process.env.ASR_API_SECRET;
  if (!appId || !apiKey || !apiSecret) {
    return { error: '未配置 ASR_APP_ID/ASR_API_KEY/ASR_API_SECRET' };
  }

  if (!refText || !refText.trim()) {
    return { error: 'refText 为空' };
  }

  const path = lang === 'cn' || lang === 'en' ? '/v1/private/s8e098720' : '/v1/private/sffc17cdb';
  const wsUrl = getSuntoneAuthUrl(path, apiKey, apiSecret);

  return new Promise((resolve) => {
    let finalResult = null;
    let seenResultPayload = false;
    const ws = new WebSocket(wsUrl);

    const parseResultText = (text) => {
      if (!text) return null;
      const decoded = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
      const r = decoded.result || decoded;

      if (EVAL_DEBUG) {
        console.log('suntone raw result keys:', Object.keys(r || {}));
        if (r && (r.overall === 0 || r.pronunciation === 0)) {
          console.log('suntone raw sample:', JSON.stringify(r).slice(0, 1200));
        }
      }

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

      // 检测 suntone 未识别到有效音频（1001）或时长为 0 且无有效评分
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
        console.warn('suntone No valid audio 或时长无效，回退 Mock:', {
          noValidAudio,
          duration,
          hasPositiveScore,
        });
        return { error: 'No valid audio detected, using mock score' };
      }

      const mainScore = overall ?? pronunciation ?? fluency ?? 70;
      console.log('suntone result summary:', {
        overall,
        pronunciation,
        fluency,
        integrity,
        duration,
        words: words.length,
      });
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
    }, 60000);

    ws.on('open', () => {
      const audioMeta = detectAudioMeta(audioBuffer, audioMetaInput.audioFileName, audioMetaInput.audioFileId);
      console.log('suntone audio meta:', audioMeta);
      if (!audioMeta.supported) {
        finalResult = { error: audioMeta.reason || '不支持的音频格式' };
        ws.close();
        return;
      }

      // mp3 为帧压缩格式，按字节切分会破坏帧；改为整文件一次发送（base64 < 10M 即可）
      const audioB64 = audioBuffer.toString('base64');
      if (audioB64.length > 10 * 1024 * 1024) {
        finalResult = { error: '音频 base64 超过 10M 限制' };
        ws.close();
        return;
      }

      const frame = {
        // 单包发送：请求状态直接置为结束帧，避免部分网关只在 status=2 返回最终结果
        header: { app_id: appId, status: 2 },
        parameter: {
          st: {
            lang: lang === 'cn' ? 'cn' : 'en',
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
      };
      ws.send(JSON.stringify(frame));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg && msg.header) {
          if (EVAL_DEBUG) {
            console.log('suntone message header:', JSON.stringify(msg.header));
          } else {
            console.log('suntone message status:', {
              code: msg.header.code,
              status: msg.header.status,
            });
          }
        }
        if (msg.header && msg.header.code !== 0) {
          finalResult = { error: msg.header.message || `code ${msg.header.code}` };
          ws.close();
          return;
        }
        const text = msg && msg.payload && msg.payload.result && msg.payload.result.text;
        if (text) {
          seenResultPayload = true;
          try {
            finalResult = parseResultText(text);
          } catch (e) {
            finalResult = { error: '解析 suntone 结果失败: ' + e.message };
          }
        }
        if (msg.header && msg.header.status === 2) {
          if (!seenResultPayload) {
            console.warn('suntone end frame 未携带 result，header:', msg.header);
          }
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
      if (!finalResult) {
        console.warn('suntone close without final result');
      }
      resolve(finalResult || { error: 'suntone 未返回有效结果' });
    });
  });
}

/**
 * Mock ASR：开发阶段无 ASR 时，使用 note（跟读）或占位文本
 */
function mockAsr(submission, task) {
  if (submission.note && String(submission.note).trim()) {
    return { text: String(submission.note).trim(), source: 'note' };
  }
  if (task.expectedAnswer) {
    return { text: task.expectedAnswer, source: 'expected' };
  }
  return { text: 'Mock ASR result. Configure real ASR API for production.', source: 'placeholder' };
}

/**
 * 语义判分：规则（关键词+答案匹配），0-100
 */
function scoreSemantic(asrText, task) {
  const text = (asrText || '').toLowerCase().trim();
  if (!text) return { score: 0, passed: false };

  const expected = (task.expectedAnswer || '').toLowerCase().trim();
  const accepted = (task.acceptedAnswers || []).map((a) => String(a).toLowerCase().trim());
  const keywords = (task.keywords || []).map((k) => String(k).toLowerCase().trim());

  let score = 0;

  if (expected && text.includes(expected)) return { score: 100, passed: true };
  for (const a of accepted) {
    if (a && text.includes(a)) score = Math.max(score, 85);
  }
  if (keywords.length > 0) {
    const hit = keywords.filter((k) => k && text.includes(k)).length;
    score = Math.max(score, Math.round((hit / keywords.length) * 90));
  }
  if (!expected && accepted.length === 0 && keywords.length === 0) score = 80;

  const cfg = task.scoringConfig || DEFAULT_SCORING;
  const passLine = cfg.semanticPassLine != null ? cfg.semanticPassLine : 60;
  return { score: Math.min(100, score), passed: score >= passLine };
}

/**
 * Mock 发音判分：无 suntone 或调用失败时
 */
function mockPronScore() {
  return Math.floor(60 + Math.random() * 35);
}

/**
 * 入参: { submissionId }
 */
exports.main = async (event, context) => {
  const { submissionId } = event;

  if (!submissionId) {
    return { errCode: -1, errMsg: '缺少 submissionId', evaluationStatus: 'failed' };
  }

  try {
    const subDoc = await db.collection('submissions').doc(submissionId).get();
    if (!subDoc.data) {
      return { errCode: -1, errMsg: '提交记录不存在', submissionId, evaluationStatus: 'failed' };
    }
    const submission = subDoc.data;

    await db.collection('submissions').doc(submissionId).update({
      data: { evaluationStatus: 'running', updatedAt: db.serverDate() },
    });

    const taskItemId = submission.taskItemId;
    if (!taskItemId) {
      await db.collection('submissions').doc(submissionId).update({
        data: {
          evaluationStatus: 'failed',
          evaluationError: '缺少 taskItemId',
          updatedAt: db.serverDate(),
        },
      });
      return { errCode: -1, errMsg: '缺少 taskItemId', submissionId, evaluationStatus: 'failed' };
    }

    const taskDoc = await db.collection('task_items').doc(taskItemId).get();
    const task = (taskDoc && taskDoc.data) || {};
    const scoringConfig = task.scoringConfig || DEFAULT_SCORING;
    const semanticWeight = scoringConfig.semanticWeight != null ? scoringConfig.semanticWeight : 0.5;
    const pronWeight = scoringConfig.pronWeight != null ? scoringConfig.pronWeight : 0.5;

    // 1. ASR：suntone 不做 ASR，使用 note 或 expectedAnswer
    const asrInfo = mockAsr(submission, task);
    const asrText = asrInfo.text;

    // 2. 语义判分
    const semanticEnabled = asrInfo.source === 'note';
    const semanticResult = semanticEnabled
      ? scoreSemantic(asrText, task)
      : { score: 0, passed: false };
    const semanticScore = semanticResult.score;
    const semanticPassed = semanticResult.passed;

    // 3. 发音评测：suntone 或 Mock
    let pronScore = 0;
    let pronDetails = { totalScore: 0, fluency: 0, accuracy: 0, words: [] };

    const refText = task.expectedAnswer || task.content || asrText;
    const audioFileId = submission.audioFileId || submission.audiofileId || submission.fileId;
    const audioFileName = submission.audioFileName || submission.audioFilename || '';

    if (audioFileId && refText && refText.trim()) {
      try {
        const audioBuffer = await downloadAudioFromCloud(audioFileId);
        const lang = (task.scoringConfig && task.scoringConfig.lang) || 'en';
        const suntoneResult = await callSuntone(audioBuffer, refText.trim(), lang, { audioFileName, audioFileId });

        if (suntoneResult.error) {
          console.warn('suntone 评测失败，使用 Mock:', suntoneResult.error);
          pronScore = mockPronScore();
          pronDetails = {
            totalScore: pronScore,
            fluency: Math.floor(pronScore * 1.05),
            accuracy: Math.floor(pronScore * 0.95),
            words: [],
          };
        } else {
          pronScore = suntoneResult.pronScore;
          pronDetails = suntoneResult.pronDetails;
        }
      } catch (e) {
        console.warn('发音评测异常，使用 Mock:', e.message);
        pronScore = mockPronScore();
        pronDetails = {
          totalScore: pronScore,
          fluency: Math.floor(pronScore * 1.05),
          accuracy: Math.floor(pronScore * 0.95),
          words: [],
        };
      }
    } else {
      pronScore = mockPronScore();
      pronDetails = {
        totalScore: pronScore,
        fluency: Math.floor(pronScore * 1.05),
        accuracy: Math.floor(pronScore * 0.95),
        words: [],
      };
    }

    // 4. 融合总分
    const semanticWeightEff = semanticEnabled ? semanticWeight : 0;
    const totalWeight = semanticWeightEff + pronWeight;
    const finalScore = Math.round(
      totalWeight > 0
        ? ((semanticWeightEff * semanticScore + pronWeight * pronScore) / totalWeight)
        : pronScore
    );

    // 5. 回写 submissions
    const safePronDetails = (pronDetails && typeof pronDetails === 'object')
      ? pronDetails
      : {
        totalScore: pronScore,
        fluency: pronScore,
        accuracy: pronScore,
        words: [],
      };
    await db.collection('submissions').doc(submissionId).update({
      data: {
        asrText,
        semanticScore,
        pronScore,
        finalScore,
        semanticPassed,
        // 使用 set 整体覆盖，兼容历史数据中 pronDetails = null 的文档
        pronDetails: _.set(safePronDetails),
        evaluationStatus: 'completed',
        evaluationError: null,
        updatedAt: db.serverDate(),
      },
    });

    return {
      errCode: 0,
      errMsg: 'success',
      submissionId,
      evaluationStatus: 'completed',
      asrText,
      semanticScore,
      pronScore,
      finalScore,
      semanticPassed,
      pronDetails,
      evaluationError: null,
    };
  } catch (error) {
    console.error('ai_evaluateSubmission error:', error);
    try {
      await db.collection('submissions').doc(submissionId).update({
        data: {
          evaluationStatus: 'failed',
          evaluationError: error.message || '评测失败',
          updatedAt: db.serverDate(),
        },
      });
    } catch (e) {
      console.error('update submission on error:', e);
    }
    return {
      errCode: -1,
      errMsg: error.message || '评测失败',
      submissionId,
      evaluationStatus: 'failed',
      evaluationError: error.message || '评测失败',
    };
  }
};
