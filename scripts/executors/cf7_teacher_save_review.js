const fs = require('fs');
const path = require('path');

const CF_DIR = path.join('cloudfunctions', 'teacher_saveReview');
const SMOKE_FILE = path.join('scripts', 'smoke', 'cf7_teacher_save_review_smoke.js');

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

module.exports = {
  supports: (title = '') => title.includes('CF7') && title.includes('teacher_saveReview'),
  run: async ({ rootDir }) => {
    const targetDir = path.join(rootDir, CF_DIR);
    ensureExists(targetDir, 'cloudfunctions/teacher_saveReview 不存在');
    ensureExists(path.join(targetDir, 'index.js'), 'teacher_saveReview 缺少 index.js');
    ensureExists(path.join(targetDir, 'package.json'), 'teacher_saveReview 缺少 package.json');
    ensureExists(path.join(rootDir, SMOKE_FILE), '缺少 CF7 smoke 测试脚本');

    return { message: 'CF7 teacher_saveReview 已就绪（含云函数与 smoke test）。' };
  },
};
