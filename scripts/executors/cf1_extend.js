const fs = require('fs');
const path = require('path');

const TARGET = path.join('cloudfunctions', 'auth_getOrCreateUser', 'index.js');

function injectMembershipBlock(content) {
  if (content.includes('hasClass =')) {
    return content;
  }
  const marker = '    // 移除敏感信息';
  if (!content.includes(marker)) {
    throw new Error('无法找到插入用户班级信息的位置');
  }
  const snippet = `    const classMemberRes = await db.collection('class_members')\n      .where({ userId: user._id, status: 'active' })\n      .limit(1)\n      .get();\n    const hasClass = classMemberRes.data && classMemberRes.data.length > 0;\n    const currentClassId = hasClass ? classMemberRes.data[0].classId : null;\n\n`;
  return content.replace(marker, snippet + marker);
}

function replaceReturnBlock(content) {
  if (content.includes('userId: user._id')) {
    return content;
  }
  const returnRegex = /return\s+{\s*\n\s+errCode:\s*0,\s*\n\s+errMsg:\s*'success',\s*\n\s+user:\s*user\s*\n\s+};/;
  if (!returnRegex.test(content)) {
    throw new Error('未找到原始返回块，无法替换');
  }
  const updated = `return {\n      errCode: 0,\n      errMsg: 'success',\n      userId: user._id,\n      role: user.role || 'student',\n      hasClass,\n      currentClassId,\n      user: user\n    };`;
  return content.replace(returnRegex, updated);
}

module.exports = {
  supports: (title) => title.includes('CF1'),
  run: async ({ rootDir }) => {
    const filePath = path.join(rootDir, TARGET);
    if (!fs.existsSync(filePath)) {
      throw new Error('找不到 auth_getOrCreateUser 文件');
    }
    let content = fs.readFileSync(filePath, 'utf-8');
    const injected = injectMembershipBlock(content);
    const nextContent = replaceReturnBlock(injected);
    if (nextContent !== content) {
      fs.writeFileSync(filePath, nextContent, 'utf-8');
      return { message: 'CF1 返回字段已扩展。' };
    }
    return { message: 'CF1 无需更新，已包含扩展字段。' };
  }
};
