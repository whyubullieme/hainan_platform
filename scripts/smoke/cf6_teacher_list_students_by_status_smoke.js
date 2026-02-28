#!/usr/bin/env node
/*
 * Minimal smoke test for cloudfunctions/teacher_listStudentsByStatus.
 */

const path = require('path');
const Module = require('module');

const fakeData = {
  users: [
    { _id: 'u-teacher', openid: 'mock-openid', role: 'teacher', name: '教练A' },
    { _id: 'stu-1', name: '学生一' },
    { _id: 'stu-2', name: '学生二' }
  ],
  classes: [{ _id: 'class-1', name: '测试班级' }],
  class_members: [
    { _id: 'cm-t', classId: 'class-1', userId: 'u-teacher', roleInClass: 'teacher', status: 'active' },
    { _id: 'cm-s1', classId: 'class-1', userId: 'stu-1', roleInClass: 'student', status: 'active' },
    { _id: 'cm-s2', classId: 'class-1', userId: 'stu-2', roleInClass: 'student', status: 'active' }
  ],
  checkins: [
    { _id: 'ck-1', classId: 'class-1', dayNumber: 1, userId: 'stu-1' }
  ],
  submissions: [
    { _id: 'sb-1', classId: 'class-1', dayNumber: 1, userId: 'stu-1' }
  ]
};

function matchesFilter(doc, filter = {}) {
  return Object.keys(filter).every((key) => {
    const value = filter[key];
    if (value && value._internal === 'in') {
      return value.values.includes(doc[key]);
    }
    return doc[key] === value;
  });
}

function createProjection(doc, projection) {
  if (!projection) {
    return { ...doc };
  }
  const projected = {};
  Object.keys(projection).forEach((field) => {
    if (projection[field]) {
      projected[field] = doc[field];
    }
  });
  return projected;
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
        data = data.map((doc) => createProjection(doc, this._projection));
      }
      return { data };
    },
    async count() {
      return { total: this._data.length };
    }
  };
}

function createDbCommand() {
  return {
    in(values) {
      return { _internal: 'in', values: Array.from(new Set(values)) };
    }
  };
}

function createDb() {
  const command = createDbCommand();
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
  const handlerPath = path.join(__dirname, '..', '..', 'cloudfunctions', 'teacher_listStudentsByStatus', 'index.js');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const handler = require(handlerPath);
  const doneRes = await handler.main({ classId: 'class-1', dayNumber: 1, status: 'done' }, {});
  if (doneRes.errCode !== 0 || doneRes.students.length !== 1 || doneRes.students[0].userId !== 'stu-1' || !doneRes.students[0].hasCheckin || !doneRes.students[0].hasSubmission) {
    console.error('CF6 done smoke test failed:', doneRes);
    process.exit(1);
  }
  const missingRes = await handler.main({ classId: 'class-1', dayNumber: 1, status: 'missing' }, {});
  if (missingRes.errCode !== 0 || missingRes.students.length !== 1 || missingRes.students[0].userId !== 'stu-2' || missingRes.students[0].hasCheckin || missingRes.students[0].hasSubmission) {
    console.error('CF6 missing smoke test failed:', missingRes);
    process.exit(1);
  }
  console.log('CF6 teacher_listStudentsByStatus smoke test passed.');
}

run().catch((err) => {
  console.error('CF6 smoke test threw error:', err);
  process.exit(1);
});
