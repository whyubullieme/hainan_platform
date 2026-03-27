#!/usr/bin/env node
/*
 * Minimal smoke test for cloudfunctions/teacher_saveReview.
 */

const path = require('path');
const Module = require('module');

const fakeData = {
  users: [
    { _id: 'u-teacher', openid: 'mock-openid', role: 'teacher', name: 'Coach' },
    { _id: 'stu-1', name: 'Student One' }
  ],
  classes: [{ _id: 'class-1', name: '测试班级' }],
  class_members: [
    { _id: 'cm-t', classId: 'class-1', userId: 'u-teacher', roleInClass: 'teacher', status: 'active' },
    { _id: 'cm-s', classId: 'class-1', userId: 'stu-1', roleInClass: 'student', status: 'active' }
  ],
  submissions: [
    { _id: 'sb-1', classId: 'class-1', userId: 'stu-1', dayNumber: 1, taskItemId: 'task-1', needsRedo: false }
  ],
  reviews: []
};

function matchesFilter(doc, filter = {}) {
  return Object.keys(filter).every((key) => doc[key] === filter[key]);
}

function createWhereResult(collectionName, filter) {
  const dataset = fakeData[collectionName] || [];
  const matched = dataset.filter((doc) => matchesFilter(doc, filter));
  return {
    _data: matched,
    _limit: null,
    limit(size) {
      this._limit = size;
      return this;
    },
    async get() {
      const data = typeof this._limit === 'number' ? this._data.slice(0, this._limit) : this._data;
      return { data };
    }
  };
}

function createDocResult(collectionName, id) {
  const dataset = fakeData[collectionName] || [];
  const findIndex = () => dataset.findIndex((doc) => doc._id === id);
  return {
    async get() {
      const idx = findIndex();
      return { data: idx >= 0 ? dataset[idx] : null };
    },
    async update({ data }) {
      const idx = findIndex();
      if (idx >= 0) {
        dataset[idx] = { ...dataset[idx], ...data };
      }
      return { updated: idx >= 0 ? 1 : 0 };
    }
  };
}

function createCollection(name) {
  const dataset = fakeData[name] || (fakeData[name] = []);
  return {
    where(filter) {
      return createWhereResult(name, filter);
    },
    doc(id) {
      return createDocResult(name, id);
    },
    async add({ data }) {
      const newDoc = { _id: `auto-${name}-${dataset.length + 1}`, ...data };
      dataset.push(newDoc);
      return { _id: newDoc._id };
    }
  };
}

function createDb() {
  return {
    collection(name) {
      return createCollection(name);
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
  const handlerPath = path.join(__dirname, '..', '..', 'cloudfunctions', 'teacher_saveReview', 'index.js');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const handler = require(handlerPath);

  const first = await handler.main({ classId: 'class-1', studentId: 'stu-1', dayNumber: 1, comment: 'Great job' }, {});
  if (first.errCode !== 0 || !first.reviewId || !first.ok || fakeData.reviews.length !== 1) {
    console.error('CF7 smoke test create failed:', first, fakeData.reviews);
    process.exit(1);
  }

  const updated = await handler.main({ classId: 'class-1', studentId: 'stu-1', dayNumber: 1, comment: 'Updated comment' }, {});
  if (updated.errCode !== 0 || updated.reviewId !== first.reviewId || fakeData.reviews[0].comment !== 'Updated comment') {
    console.error('CF7 smoke test update failed:', updated, fakeData.reviews);
    process.exit(1);
  }

  const redo = await handler.main({ classId: 'class-1', studentId: 'stu-1', dayNumber: 1, reviewAction: 'redo' }, {});
  if (redo.errCode !== 0 || redo.reviewAction !== 'redo' || !fakeData.submissions[0].needsRedo || !fakeData.submissions[0].redoComment) {
    console.error('CF7 smoke test redo failed:', redo, fakeData.submissions);
    process.exit(1);
  }

  console.log('CF7 teacher_saveReview smoke test passed.');
}

run().catch((err) => {
  console.error('CF7 smoke test threw error:', err);
  process.exit(1);
});
