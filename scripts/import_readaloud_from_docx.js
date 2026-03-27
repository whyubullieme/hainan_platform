#!/usr/bin/env node
/*
 * Import read-aloud tasks from a folder of .docx files.
 *
 * Usage:
 * node scripts/import_readaloud_from_docx.js --src "/tmp/hainan_zip_import/跟读模块-V1-3-26" --out "cloudfunctions/admin_seedDemoTasks/readaloud_tasks.generated.json"
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_SCORING = {
  semanticWeight: 0.5,
  pronWeight: 0.5,
  semanticPassLine: 60,
  pronPassLine: 60,
  lang: 'en'
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--src') {
      args.src = argv[i + 1];
      i += 1;
    } else if (token === '--out') {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function walkDocx(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDocx(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.docx')) {
      out.push(full);
    }
  });
  return out;
}

function readDocxAsText(docPath) {
  try {
    const txt = execFileSync('textutil', ['-convert', 'txt', '-stdout', docPath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return txt;
  } catch (error) {
    throw new Error(`读取 docx 失败: ${docPath} (${error.message})`);
  }
}

function normalizeSentence(line) {
  return line
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
  if (/^(Level|Pronunciation|Strengths|Issues|Suggested|Front Desk|Check-in)/i.test(line)) return false;
  return /^[A-Za-z0-9 ,.'?!:;()\-\/&]+$/.test(line);
}

function extractSentences(docText) {
  const lines = docText.split(/\r?\n/).map((l) => l.trim());
  const sentenceMarkers = [];
  lines.forEach((line, idx) => {
    if (/^句子\s*\d+/.test(line)) {
      sentenceMarkers.push(idx);
    }
  });

  const collected = [];
  if (sentenceMarkers.length > 0) {
    sentenceMarkers.forEach((markerIdx) => {
      for (let j = markerIdx + 1; j < Math.min(lines.length, markerIdx + 8); j += 1) {
        const candidate = normalizeSentence(lines[j]);
        if (!candidate) continue;
        if (looksLikeEnglishSentence(candidate)) {
          collected.push(candidate);
          break;
        }
      }
    });
  } else {
    lines.forEach((line) => {
      const candidate = normalizeSentence(line);
      if (looksLikeEnglishSentence(candidate)) {
        collected.push(candidate);
      }
    });
  }

  return Array.from(new Set(collected));
}

function baseNameWithoutExt(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function categoryFromPath(filePath, rootDir) {
  const rel = path.relative(rootDir, filePath);
  const parts = rel.split(path.sep);
  if (parts.length >= 2) return parts[0];
  return '未分类';
}

function buildTasks(docPaths, rootDir) {
  const tasks = [];
  docPaths.forEach((docPath) => {
    const text = readDocxAsText(docPath);
    const sentences = extractSentences(text);
    const docTitle = baseNameWithoutExt(docPath);
    const category = categoryFromPath(docPath, rootDir);
    sentences.forEach((sentence, idx) => {
      tasks.push({
        title: `${docTitle} - 句${idx + 1}`,
        content: sentence,
        taskType: 'read_aloud',
        expectedAnswer: sentence,
        acceptedAnswers: [sentence],
        keywords: sentence
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 4)
          .slice(0, 5),
        scoringConfig: DEFAULT_SCORING,
        sceneName: docTitle,
        sceneDesc: category
      });
    });
  });
  return tasks;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const src = args.src ? path.resolve(args.src) : null;
  const out = args.out ? path.resolve(args.out) : null;

  if (!src || !out) {
    console.error('用法: node scripts/import_readaloud_from_docx.js --src <docx目录> --out <输出json路径>');
    process.exit(1);
  }
  if (!fs.existsSync(src)) {
    console.error(`源目录不存在: ${src}`);
    process.exit(1);
  }

  const docPaths = walkDocx(src);
  if (docPaths.length === 0) {
    console.error(`目录下没有 docx: ${src}`);
    process.exit(1);
  }

  const tasks = buildTasks(docPaths, src);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(tasks, null, 2), 'utf-8');

  console.log(`导入完成: docs=${docPaths.length}, tasks=${tasks.length}`);
  console.log(`输出文件: ${out}`);
}

main();
