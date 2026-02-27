#!/usr/bin/env node
/*
 * Autonomous agent loop.
 * - Reads AGENT_TASKS.md and picks the first unchecked task
 * - Dispatches to executor modules in scripts/executors
 * - Runs optional acceptance commands
 * - Updates AGENT_TASKS and PROGRESS, prints status for Feishu notification hook
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TASK_FILE = path.join(ROOT, 'AGENT_TASKS.md');
const PROGRESS_FILE = path.join(ROOT, 'PROGRESS.md');
const EXECUTOR_DIR = path.join(__dirname, 'executors');
const DEFAULT_TASKS_MD = `# AGENT_TASKS

## 待办列表
- [ ] 待初始化任务：请在此处添加真实待办。

## 验收命令
\`\`\`bash
# TODO: 添加验收命令
\`\`\`

## 阻断说明
- 暂无。
`;

function readFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

function parseTasks(md) {
  const lines = md.split('\n');
  return lines
    .map((line, idx) => {
      const match = line.match(/^- \[( |x)\] (.+)$/);
      if (!match) return null;
      return {
        lineIndex: idx,
        raw: line,
        done: match[1] === 'x',
        title: match[2].trim(),
      };
    })
    .filter(Boolean);
}

function selectNextTask(tasks) {
  return tasks.find((task) => !task.done) || null;
}

function updateTaskStatus(md, targetTask, done) {
  const lines = md.split('\n');
  const current = lines[targetTask.lineIndex];
  const nextLine = current.replace(/^- \[[ x]\]/, done ? '- [x]' : '- [ ]');
  lines[targetTask.lineIndex] = nextLine;
  return lines.join('\n');
}

function appendProgress(entry) {
  const timestamp = new Date().toISOString();
  const block = `\n- ${timestamp} — ${entry}\n`;
  fs.appendFileSync(PROGRESS_FILE, block);
}

function ensureProgressFile() {
  if (fs.existsSync(PROGRESS_FILE)) return false;
  fs.writeFileSync(PROGRESS_FILE, '# PROGRESS LOG\n', 'utf-8');
  return true;
}

function ensureTaskFile() {
  if (fs.existsSync(TASK_FILE)) return false;
  fs.writeFileSync(TASK_FILE, DEFAULT_TASKS_MD, 'utf-8');
  appendProgress('AGENT_TASKS.md 初始化完成（自动创建默认模板）。');
  return true;
}

function ensureExecutorDir() {
  if (fs.existsSync(EXECUTOR_DIR)) return false;
  fs.mkdirSync(EXECUTOR_DIR, { recursive: true });
  appendProgress('scripts/executors 目录不存在，已自动创建。');
  return true;
}

function runAcceptanceCommands() {
  // Placeholder for future acceptance commands once defined in package.json
  const commands = [];
  for (const cmd of commands) {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT });
  }
}

function resolveExecutor(taskTitle) {
  let files = [];
  try {
    files = fs.readdirSync(EXECUTOR_DIR);
  } catch (err) {
    console.warn('无法读取 executors 目录：', err.message);
    return null;
  }
  for (const file of files) {
    const executorPath = path.join(EXECUTOR_DIR, file);
    const mod = require(executorPath);
    if (mod && typeof mod.supports === 'function' && mod.supports(taskTitle)) {
      return mod;
    }
  }
  return null;
}

async function main() {
  ensureProgressFile();
  ensureTaskFile();
  ensureExecutorDir();

  const md = readFileSafe(TASK_FILE);
  const tasks = parseTasks(md);
  if (tasks.length === 0) {
    console.log('No tasks found in AGENT_TASKS.md');
    return;
  }

  const task = selectNextTask(tasks);
  if (!task) {
    console.log('All tasks completed.');
    return;
  }

  console.log(`Executing task: ${task.title}`);
  const executor = resolveExecutor(task.title);
  if (!executor) {
    console.log(`No executor found for task: ${task.title}`);
    appendProgress(`Task "${task.title}" skipped — no executor available.`);
    return;
  }

  let attempt = 0;
  let success = false;
  let lastError = null;
  const maxAttempts = 3;

  while (attempt < maxAttempts && !success) {
    attempt += 1;
    try {
      console.log(`Attempt ${attempt} for task: ${task.title}`);
      // Executor should return { message, requiresAcceptance?: boolean }
      const result = await executor.run({ rootDir: ROOT, taskTitle: task.title });
      if (result && result.requiresAcceptance) {
        runAcceptanceCommands();
      }
      success = true;
      appendProgress(`Task "${task.title}" completed. ${result?.message || ''}`.trim());
      const updatedMd = updateTaskStatus(md, task, true);
      fs.writeFileSync(TASK_FILE, updatedMd, 'utf-8');
      console.log(`[SUCCESS] ${task.title}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`[ERROR] attempt ${attempt}:`, error.message);
    }
  }

  const reason = lastError ? lastError.message : 'unknown error';
  appendProgress(`Task "${task.title}" failed after ${maxAttempts} attempts. Reason: ${reason}`);
  console.error(`Task failed after ${maxAttempts} attempts.`);
  process.exit(1);
}

main().catch((err) => {
  console.error('agent_loop fatal error:', err);
  process.exit(1);
});
