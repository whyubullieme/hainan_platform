const fs = require('fs');
const path = require('path');

const CF_DIR = path.join('cloudfunctions', 'teacher_getOverview');

module.exports = {
  supports: (title = '') => title.includes('CF5') && title.includes('teacher_getOverview'),
  run: async ({ rootDir }) => {
    const targetDir = path.join(rootDir, CF_DIR);
    if (!fs.existsSync(targetDir)) {
      throw new Error('cloudfunctions/teacher_getOverview 不存在');
    }
    const indexFile = path.join(targetDir, 'index.js');
    if (!fs.existsSync(indexFile)) {
      throw new Error('teacher_getOverview 缺少 index.js');
    }
    return { message: 'CF5 teacher_getOverview 已存在，手动实现版。' };
  },
};
