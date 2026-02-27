#!/usr/bin/env node
/*
 * Minimal smoke test for cloudfunctions/teacher_getOverview.
 * Mocks wx-server-sdk to run the handler locally without CloudBase.
 */

const path = require('path');
const Module = require('module');

const fakeData = {
  users: [{ _id: 'u-teacher', openid: 'mock-openid', role: 'teacher' }],
  classes: [{ _id: 'class-1', name: '测试班级', startDate: '2024-02-20' }],
  class_members: [
    { _id: 'cm-t', classId: 'class-1', userId: 'u-teacher', roleInClass: 'teacher', status: 'active' },
    { _id: 'cm-s1', classId: 'class-1', userId: 'stu-1', roleInClass: 'student', status: 'active' },
    { _id: 'cm-s2', classId: 'class-1', userId: 'stu-2', roleInClass: 'student', status: 'active' }
  ],
  checkins: [
    { _id: 'ck-1', classId: 'class-1', dayNumber: 1, userId: 'stu-1' }
  ],
  submissions: [
    { _id: 'sb-1', classId: 'class-1', dayNumber: 1, userId: 'stu-1' },
    { _id: 'sb-2', classId: 'class-1', dayNumber: 1, userId: 'stu-2' }
  ],
  reviews: [
    { _id: 'rv-1', classId: 'class-1', dayNumber: 1, studentId: 'stu-1' }
  ]
};

function matchesFilter(doc, filter = {}) {
  return Object.keys(filter).every((key) => {
    if (filter[key] === undefined) return true;
    return doc[key] === filter[key];
  });
}

function createWhereResult(collectionName, filter) {
  const dataset = fakeData[collectionName] || [];
  const matched = dataset.filter((doc) => matchesFilter(doc, filter));
  return {
    _data: matched,
    limit(limitSize) {
      this._limit = limitSize;
      return this;
    },
    async get() {
      const data = typeof this._limit === 'number' ? this._data.slice(0, this._limit) : this._data;
      return { data };
    },
    async count() {
      return { total: this._data.length };
    }
  };
}

function createAggregate(collectionName) {
  const dataset = [...(fakeData[collectionName] || [])];
  let filtered = dataset;
  let groupField = null;
  return {
    match(filter) {
      filtered = filtered.filter((doc) => matchesFilter(doc, filter));
      return this;
    },
    group({ _id }) {
      groupField = (_id || '').replace('$', '');
      return this;
    },
    count(fieldName) {
      const uniq = new Set(filtered.map((doc) => doc[groupField]).filter(Boolean));
      const result = { list: uniq.size ? [{ [fieldName]: uniq.size }] : [] };
      return {
        async end() {
          return result;
        }
      };
    }
  };
}

function createDb() {
  return {
    collection(name) {
      return {
        where(filter) {
          return createWhereResult(name, filter);
        },
        doc(id) {
          const dataset = fakeData[name] || [];
          const target = dataset.find((item) => item._id === id);
          return {
            async get() {
              return { data: target || null };
            }
          };
        },
        aggregate() {
          return createAggregate(name);
        }
      };
    }
  };
}

function createMockSdk() {
  const mockDb = createDb();
  return {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'test',
    database: () => mockDb,
    getWXContext: () => ({ OPENID: 'mock-openid' })
  };
}

const originalRequire = Module.prototype.require;
Module.prototype.require = function patched(request) {
  if (request === 'wx-server-sdk') {
    return createMockSdk();
  }
  return originalRequire.apply(this, arguments);
};

async function run() {
  const handlerPath = path.join(__dirname, '..', '..', 'cloudfunctions', 'teacher_getOverview', 'index.js');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const handler = require(handlerPath);
  const result = await handler.main({ classId: 'class-1', dayNumber: 1 }, {});
  if (result.errCode !== 0) {
    console.error('CF5 smoke test failed:', result);
    process.exit(1);
  }
  if (result.totalStudents !== 2 || result.checkedInCount !== 1 || result.submittedCount !== 2 || result.reviewedCount !== 1) {
    console.error('CF5 smoke test count mismatch:', result);
    process.exit(1);
  }
  console.log('CF5 teacher_getOverview smoke test passed.', result);
}

run().catch((err) => {
  console.error('CF5 smoke test threw error:', err);
  process.exit(1);
});
