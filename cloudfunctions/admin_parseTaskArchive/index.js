const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DEFAULT_SCORING = {
  semanticWeight: 0.5,
  pronWeight: 0.5,
  semanticPassLine: 60,
  pronPassLine: 60,
  lang: 'en',
};

function decodeXmlText(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

function docxXmlToText(xml = '') {
  const parts = [];
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let m = re.exec(xml);
  while (m) {
    parts.push(decodeXmlText(m[1]));
    m = re.exec(xml);
  }
  return parts.join('\n');
}

function normalizeSentence(line) {
  return String(line || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, '\'')
    .trim();
}

function looksLikeEnglishSentence(line) {
  if (!line) return false;
  if (/[\u4e00-\u9fff]/.test(line)) return false;
  if (!/[A-Za-z]/.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (line.length > 220) return false;
  return /^[A-Za-z0-9 ,.'?!:;()\-\/&]+$/.test(line);
}

function extractSentences(docText) {
  const lines = String(docText || '').split(/\r?\n/).map((l) => l.trim());
  const sentenceMarkers = [];
  lines.forEach((line, idx) => {
    if (/^句子\s*\d+/.test(line)) sentenceMarkers.push(idx);
  });

  const collected = [];
  if (sentenceMarkers.length > 0) {
    sentenceMarkers.forEach((markerIdx) => {
      for (let j = markerIdx + 1; j < Math.min(lines.length, markerIdx + 8); j += 1) {
        const candidate = normalizeSentence(lines[j]);
        if (looksLikeEnglishSentence(candidate)) {
          collected.push(candidate);
          break;
        }
      }
    });
  } else {
    lines.forEach((line) => {
      const candidate = normalizeSentence(line);
      if (looksLikeEnglishSentence(candidate)) collected.push(candidate);
    });
  }

  return Array.from(new Set(collected));
}

function buildItem({ title, content, sceneName = '', sceneDesc = '' }) {
  return {
    title,
    content,
    taskType: 'read_aloud',
    expectedAnswer: content,
    acceptedAnswers: [content],
    keywords: content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 5),
    scoringConfig: DEFAULT_SCORING,
    sceneName,
    sceneDesc,
    status: 'draft',
  };
}

async function parseDocxBuffer(buffer, displayPath) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) return [];
  const xml = await docXmlFile.async('string');
  const text = docxXmlToText(xml);
  const sentences = extractSentences(text);
  const baseTitle = path.basename(displayPath, '.docx');
  const sceneDesc = path.basename(path.dirname(displayPath));
  return sentences.map((s, idx) => buildItem({
    title: `${baseTitle} - 句${idx + 1}`,
    content: s,
    sceneName: baseTitle,
    sceneDesc,
  }));
}

async function parseZipBuffer(buffer) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(zip.files);
  const items = [];
  const errors = [];

  for (const name of entries) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const lower = name.toLowerCase();
    try {
      if (lower.endsWith('.docx')) {
        const docxBuffer = await entry.async('nodebuffer');
        // eslint-disable-next-line no-await-in-loop
        const one = await parseDocxBuffer(docxBuffer, name);
        items.push(...one);
      } else if (lower.endsWith('.json')) {
        const content = await entry.async('string');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) items.push(...parsed.map((x) => ({ ...x, status: 'draft' })));
      }
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  return { items, errors };
}

exports.main = async (event = {}) => {
  const { fileID, fileName = '' } = event;
  if (!fileID) {
    return { errCode: -1, errMsg: '缺少 fileID' };
  }

  try {
    const downRes = await cloud.downloadFile({ fileID });
    const fileContent = downRes.fileContent;
    const lower = String(fileName || fileID).toLowerCase();
    let items = [];
    let errors = [];

    if (lower.endsWith('.zip')) {
      const zipRes = await parseZipBuffer(fileContent);
      items = zipRes.items;
      errors = zipRes.errors;
    } else if (lower.endsWith('.docx')) {
      items = await parseDocxBuffer(fileContent, fileName || 'uploaded.docx');
    } else if (lower.endsWith('.json')) {
      const parsed = JSON.parse(Buffer.from(fileContent).toString('utf8'));
      if (!Array.isArray(parsed)) throw new Error('JSON 须为数组');
      items = parsed.map((x) => ({ ...x, status: 'draft' }));
    } else {
      return { errCode: -1, errMsg: '仅支持 zip/docx/json' };
    }

    const preview = items.slice(0, 20);
    return {
      errCode: 0,
      errMsg: 'success',
      total: items.length,
      preview,
      items,
      errors,
    };
  } catch (error) {
    console.error('admin_parseTaskArchive error:', error);
    return { errCode: -1, errMsg: error.message || '解析失败' };
  }
};
