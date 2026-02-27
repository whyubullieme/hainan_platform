#!/usr/bin/env node
/**
 * Smoke-test for agent_loop bootstrap helpers.
 * Spawns agent_loop inside a temporary workspace with missing files
 * and verifies that ensure* functions create the expected artifacts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureCleanUp(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`清理临时目录失败（${dir}）：${err.message}`);
  }
}

function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-smoke-'));
  const tmpScriptsDir = path.join(tmpRoot, 'scripts');
  fs.mkdirSync(tmpScriptsDir, { recursive: true });

  const agentLoopSrc = path.join(__dirname, 'agent_loop.js');
  const agentLoopDst = path.join(tmpScriptsDir, 'agent_loop.js');
  fs.copyFileSync(agentLoopSrc, agentLoopDst);

  try {
    execFileSync('node', [agentLoopDst], { cwd: tmpRoot, stdio: 'inherit' });
  } catch (err) {
    ensureCleanUp(tmpRoot);
    throw new Error(`agent_loop 执行失败：${err.message}`);
  }

  const taskFile = path.join(tmpRoot, 'AGENT_TASKS.md');
  const progressFile = path.join(tmpRoot, 'PROGRESS.md');
  const executorsDir = path.join(tmpScriptsDir, 'executors');

  assert(fs.existsSync(taskFile), 'ensureTaskFile 未创建 AGENT_TASKS.md');
  assert(fs.existsSync(progressFile), 'ensureProgressFile 未创建 PROGRESS.md');
  assert(fs.existsSync(executorsDir), 'ensureExecutorDir 未创建 scripts/executors');

  const tasksContent = fs.readFileSync(taskFile, 'utf-8');
  assert(/# AGENT_TASKS/.test(tasksContent), 'AGENT_TASKS.md 内容异常');

  const progressContent = fs.readFileSync(progressFile, 'utf-8');
  assert(progressContent.includes('AGENT_TASKS.md 初始化完成'), 'PROGRESS.md 未记录初始化日志');

  ensureCleanUp(tmpRoot);
  console.log('agent_loop bootstrap smoke-test passed.');
}

main();
