const fs = require('fs');
const path = require('path');

const CF_DIR = path.join('cloudfunctions', 'teacher_listStudentsByStatus');
const SMOKE_FILE = path.join('scripts', 'smoke', 'cf6_teacher_list_students_by_status_smoke.js');

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

module.exports = {
  supports: (title = '') => title.includes('CF6') && title.includes('teacher_listStudentsByStatus'),
  run: async ({ rootDir }) => {
    const targetDir = path.join(rootDir, CF_DIR);
    ensureExists(targetDir, 'cloudfunctions/teacher_listStudentsByStatus 不存在');
    ensureExists(path.join(targetDir, 'index.js'), 'teacher_listStudentsByStatus 缺少 index.js');
    ensureExists(path.join(targetDir, 'package.json'), 'teacher_listStudentsByStatus 缺少 package.json');
    ensureExists(path.join(rootDir, SMOKE_FILE), '缺少 CF6 smoke 测试脚本');

    return { message: 'CF6 teacher_listStudentsByStatus 已就绪（含云函数与 smoke test）。' };
  },
};
