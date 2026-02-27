# 海南英语学习平台 - 微信小程序 MVP

## 项目简介

基于微信小程序和腾讯云开发的英语学习平台 MVP 版本，支持学生、教师、管理员三种角色。

## 技术栈

- **前端**: 微信小程序原生开发
- **后端**: 腾讯云开发 CloudBase
- **数据库**: CloudBase 云数据库
- **云函数**: Node.js

## 快速开始

### 1. 环境要求

- 微信开发者工具（最新版本）
- Node.js 12+ （用于云函数开发）
- 微信小程序 AppID（可在微信公众平台申请）

### 2. 配置云开发环境

1. 打开微信开发者工具，导入项目（选择项目根目录）
2. 在微信开发者工具中点击「云开发」按钮，开通云开发环境
3. 获取云环境 ID（在云开发控制台查看）
4. 修改 `app.js` 中的 `env` 参数：

```javascript
wx.cloud.init({
  env: 'your-cloud-env-id', // 替换为你的云环境 ID
  traceUser: true,
});
```

### 3. 创建数据库集合

**重要**: 如果遇到 `database collection not exists` 错误，说明需要先创建数据库集合。

**详细步骤请查看**: [数据库集合创建指南](./docs/database_setup.md)

**快速开始**（最少需要创建的集合）：
1. 在云开发控制台 → 「数据库」→ 「创建集合」
2. 创建 `users` 集合（登录功能必需）
3. 设置权限：所有用户可读，仅创建者可写

**MVP 精简集合**（共 7 个）：
1. `users` - 用户表 ⚠️ **必需**
2. `classes` - 班级表
3. `class_members` - 班级成员表
4. `task_items` - 任务项表
5. `checkins` - 签到表
6. `submissions` - 提交记录表
7. `reviews` - 批改记录表

详见 `docs/mvp_simplified_spec.md`

### 4. 部署云函数（精简 MVP: CF1–CF8）

- `auth_getOrCreateUser` - CF1 用户认证
- `class_joinByInviteCode` - CF2 加入班级
- `student_getTodayPlan` - CF3 今日任务+状态
- `student_markProgress` - CF4 签到+提交
- `teacher_getOverview` - CF5 教师概览
- `teacher_listStudentsByStatus` - CF6 学生名单
- `teacher_saveReview` - CF7 保存点评
- `admin_createClassAndInitTasks` - CF8 建班+初始化

详见 `docs/mvp_simplified_spec.md`

### 5. 运行项目

1. 在微信开发者工具中点击「编译」
2. 首次运行会跳转到登录页面
3. 测试登录功能（需要先部署 `auth_getOrCreateUser` 云函数）

## 项目结构

```
hainan_platform/
├── app.js                   # 小程序入口（必需，在根目录）
├── app.json                 # 小程序公共配置（必需，在根目录）
├── app.wxss                 # 小程序公共样式表（在根目录）
├── sitemap.json             # 站点地图配置
├── project.config.json      # 项目配置文件
├── pages/                   # 页面目录
│   ├── auth/                # 认证相关页面
│   │   ├── login/          # 登录页（login.js, login.wxml, login.wxss, login.json）
│   │   └── joinClass/       # 加入班级页
│   ├── student/            # 学生端页面
│   ├── teacher/            # 教师端页面
│   └── admin/              # 管理员页面
├── components/              # 自定义组件
│   ├── TaskCard/           # 任务卡片组件
│   ├── TagSelector/        # 标签选择器组件
│   ├── EmptyState/         # 空状态组件
│   └── SimpleStatsCard/    # 统计卡片组件
├── services/                # API 服务层
│   ├── api.js              # 云函数调用封装
│   ├── auth.js             # 认证相关 API
│   ├── student.js          # 学生端 API
│   ├── teacher.js          # 教师端 API
│   └── admin.js            # 管理员 API
├── utils/                   # 工具函数
│   ├── storage.js          # 本地存储封装
│   ├── format.js           # 格式化工具
│   └── validator.js        # 验证工具
├── images/                  # 图片资源
├── cloudfunctions/          # 云函数目录
│   ├── auth_getOrCreateUser/  # 用户认证/创建
│   ├── class_joinByInviteCode/ # 加入班级
│   └── ...                 # 其他云函数
└── docs/                    # 文档目录
```

**注意**: 根据微信小程序规范，`app.js`、`app.json`、`app.wxss` 必须放在项目根目录。

## 开发进度

### ✅ 已完成
- [x] 项目结构搭建
- [x] 基础工具类（storage, format, api）
- [x] 登录页面 UI 和逻辑
- [x] 用户认证云函数（auth_getOrCreateUser）

### 🚧 进行中
- [ ] 加入班级功能
- [ ] 学生端核心功能
- [ ] 教师端核心功能

### 📋 待开发
详见 `development_plan.md`

## 注意事项

1. **云环境 ID**: 必须在 `app.js` 中配置正确的云环境 ID
2. **数据库权限**: 需要在云开发控制台配置数据库的读写权限
3. **云函数部署**: 每个云函数都需要单独部署
4. **测试数据**: 建议先准备测试用的种子数据（scenarios, phrases, error_tags 等）
5. **目录结构**: 小程序主体文件（app.js, app.json, app.wxss）必须在项目根目录
6. **页面文件**: 每个页面必须包含四个文件（.js, .wxml, .json, .wxss），且文件名必须相同

## 相关文档

- [MVP 需求文档](./mvp_todolist.md)
- [开发计划](./development_plan.md)

## 许可证

MIT

