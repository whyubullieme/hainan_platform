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
  task_items: [
    { _id: 'task-1', classId: 'class-1', dayNumber: 1, taskType: 'read_aloud' }
  ],
  submissions: [
    { _id: 'sb-1', classId: 'class-1', dayNumber: 1, userId: 'stu-1', taskItemId: 'task-1' },
    { _id: 'sb-2', classId: 'class-1', dayNumber: 1, userId: 'stu-2', taskItemId: 'task-1', needsRedo: true }
  ],
  reviews: [
    { _id: 'rv-1', classId: 'class-1', dayNumber: 1, studentId: 'stu-1', reviewAction: 'approve' }
  ]
};

function matchesFilter(doc, filter = {}) {
  return Object.keys(filter).every((key) => {
    const value = filter[key];
    if (value === undefined) return true;
    if (value && value._internal === 'in') {
      return value.values.includes(doc[key]);
    }
    return doc[key] === value;
  });
}

function createWhereResult(collectionName, filter) {
  const dataset = fakeData[collectionName] || [];
  const matched = dataset.filter((doc) => matchesFilter(doc, filter));
  return {
    _data: matched,
    _limit: null,
    _skip: 0,
    _projection: null,
    limit(limitSize) {
      this._limit = limitSize;
      return this;
    },
    skip(skipSize) {
      this._skip = skipSize;
      return this;
    },
    field(projection) {
      this._projection = projection;
      return this;
    },
    async get() {
      let data = this._data.slice(this._skip);
      if (typeof this._limit === 'number') {
        data = data.slice(0, this._limit);
      }
      if (this._projection) {
        data = data.map((doc) => {
          const nextDoc = {};
          Object.keys(this._projection).forEach((key) => {
            if (this._projection[key]) {
              nextDoc[key] = doc[key];
            }
          });
          return nextDoc;
        });
      }
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
  const command = {
    in(values) {
      return { _internal: 'in', values: Array.from(new Set(values)) };
    }
  };
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
    },
    command
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
  if (result.totalStudents !== 2 || result.checkedInCount !== 1 || result.submittedCount !== 1 || result.reviewedCount !== 0) {
    console.error('CF5 smoke test count mismatch:', result);
    process.exit(1);
  }

  const dayFromDate = await handler.main({ classId: 'class-1', date: '2024-02-20' }, {});
  if (dayFromDate.errCode !== 0 || dayFromDate.dayNumber !== 1) {
    console.error('CF5 smoke test date resolver failed:', dayFromDate);
    process.exit(1);
  }

  console.log('CF5 teacher_getOverview smoke test passed.', result);
}

run().catch((err) => {
  console.error('CF5 smoke test threw error:', err);
  process.exit(1);
});
