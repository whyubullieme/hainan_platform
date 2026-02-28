const fs = require('fs');
const path = require('path');

const CF_DIR = path.join('cloudfunctions', 'teacher_getOverview');
const SMOKE_FILE = path.join('scripts', 'smoke', 'cf5_teacher_get_overview_smoke.js');

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

module.exports = {
  supports: (title = '') => title.includes('CF5') && title.includes('teacher_getOverview'),
  run: async ({ rootDir }) => {
    const targetDir = path.join(rootDir, CF_DIR);
    ensureExists(targetDir, 'cloudfunctions/teacher_getOverview 不存在');
    ensureExists(path.join(targetDir, 'index.js'), 'teacher_getOverview 缺少 index.js');
    ensureExists(path.join(targetDir, 'package.json'), 'teacher_getOverview 缺少 package.json');
    ensureExists(path.join(rootDir, SMOKE_FILE), '缺少 CF5 smoke 测试脚本');

    return { message: 'CF5 teacher_getOverview 已就绪（含云函数与 smoke test）。' };
  },
};
