#!/usr/bin/env node
/*
 * Full smoke test for all cloudfunctions index handlers
 * - Loads each cloud function with a mocked wx-server-sdk
 * - Invokes exports.main({}) and ensures it does not throw
 * - Reports pass/fail/skip summary
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const CF_ROOT = path.join(ROOT, 'cloudfunctions');
const originalRequire = Module.prototype.require;

function createCommandMock() {
  return new Proxy({}, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      return (...args) => ({ _op: String(prop), args });
    }
  });
}

function createAggregateChain() {
  const chain = {
    match() { return chain; },
    group() { return chain; },
    project() { return chain; },
    sort() { return chain; },
    limit() { return chain; },
    skip() { return chain; },
    unwind() { return chain; },
    lookup() { return chain; },
    addFields() { return chain; },
    replaceRoot() { return chain; },
    count() { return chain; },
    async end() { return { list: [] }; }
  };
  return chain;
}

function createQueryChain() {
  const chain = {
    where() { return chain; },
    limit() { return chain; },
    skip() { return chain; },
    field() { return chain; },
    orderBy() { return chain; },
    async get() { return { data: [] }; },
    async count() { return { total: 0 }; },
    async add() { return { _id: 'mock-id' }; },
    async update() { return { updated: 1, stats: { updated: 1 } }; },
    async set() { return { updated: 1, stats: { updated: 1 } }; },
    async remove() { return { deleted: 0, stats: { removed: 0 } }; },
    doc(id) {
      return {
        async get() { return { data: id ? { _id: id } : null }; },
        async update() { return { updated: 1, stats: { updated: 1 } }; },
        async set() { return { updated: 1, stats: { updated: 1 } }; },
        async remove() { return { deleted: 0, stats: { removed: 0 } }; }
      };
    },
    aggregate() { return createAggregateChain(); }
  };
  return chain;
}

function createCloudSdkMock() {
  const db = {
    command: createCommandMock(),
    serverDate() { return new Date(); },
    collection() { return createQueryChain(); }
  };

  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() { return db; },
    getWXContext() {
      return {
        OPENID: 'smoke-openid',
        APPID: 'smoke-appid',
        UNIONID: 'smoke-unionid'
      };
    },
    async callFunction() {
      return { result: { errCode: 0, errMsg: 'success' } };
    },
    async uploadFile() {
      return { fileID: 'cloud://mock/file' };
    }
  };
}

Module.prototype.require = function patchedRequire(request) {
  if (request === 'wx-server-sdk') {
    return createCloudSdkMock();
  }
  return originalRequire.apply(this, arguments);
};

function listCloudFunctionEntries() {
  if (!fs.existsSync(CF_ROOT)) {
    return [];
  }
  return fs.readdirSync(CF_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const name = entry.name;
      const indexPath = path.join(CF_ROOT, name, 'index.js');
      return { name, indexPath };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function clearModuleCache(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
  } catch (e) {
    // ignore
  }
}

async function runOne(entry) {
  const { name, indexPath } = entry;
  if (!fs.existsSync(indexPath)) {
    return { name, status: 'skipped', reason: 'missing index.js' };
  }

  clearModuleCache(indexPath);
  let mod;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    mod = require(indexPath);
  } catch (error) {
    return { name, status: 'failed', stage: 'load', error: error.message };
  }

  if (!mod || typeof mod.main !== 'function') {
    return { name, status: 'failed', stage: 'shape', error: 'exports.main is not a function' };
  }

  try {
    const result = await mod.main({}, {});
    return { name, status: 'passed', result };
  } catch (error) {
    return { name, status: 'failed', stage: 'invoke', error: error.message };
  }
}

async function main() {
  const entries = listCloudFunctionEntries();
  const results = [];
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop
    const one = await runOne(entry);
    results.push(one);
  }

  const passed = results.filter((r) => r.status === 'passed');
  const failed = results.filter((r) => r.status === 'failed');
  const skipped = results.filter((r) => r.status === 'skipped');

  console.log(`CF smoke summary: total=${results.length}, passed=${passed.length}, failed=${failed.length}, skipped=${skipped.length}`);
  results.forEach((r) => {
    if (r.status === 'passed') {
      console.log(`PASS ${r.name}`);
    } else if (r.status === 'skipped') {
      console.log(`SKIP ${r.name} (${r.reason})`);
    } else {
      console.log(`FAIL ${r.name} [${r.stage}] ${r.error}`);
    }
  });

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('all_cloudfunctions_smoke failed:', error);
  process.exit(1);
});
