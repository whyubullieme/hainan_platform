# 微信小程序 MVP 开发计划

## 一、技术栈选择

### 前端技术栈
- **框架**: 微信小程序原生开发（不使用 uni-app/Taro 等框架）
- **语言**: JavaScript (ES6+)
- **UI 组件库**: 微信小程序原生组件 + 自定义组件
- **状态管理**: 本地存储 (localStorage) + 页面级状态
- **样式**: WXSS (支持 rpx 响应式单位)
- **UI 语言**: 中文

### 后端技术栈
- **云服务**: 腾讯云开发 CloudBase
- **数据库**: CloudBase 云数据库 (MongoDB-like)
- **云函数**: Node.js 12+ (CloudBase 云函数)
- **认证**: CloudBase 微信登录 (openid)
- **存储**: CloudBase 云存储 (如需要)

### 开发工具
- **IDE**: 微信开发者工具
- **版本控制**: Git
- **包管理**: npm (用于云函数依赖)

---

## 二、项目结构

```
hainan_platform/
├── app.js                          # 小程序入口（✅ 已实现）
├── app.json                        # 全局配置（✅ 已配置）
├── app.wxss                        # 全局样式（✅ 已配置）
├── sitemap.json                    # 站点地图配置
├── project.config.json             # 项目配置
│
├── pages/                           # 页面目录（✅ 所有页面基础文件已创建）
│   ├── auth/                       # 认证相关页面
│   │   ├── login/                  # 登录页（✅ 功能完整）
│   │   └── joinClass/              # 加入班级页（⚠️ 基础文件已创建，功能待实现）
│   ├── student/                    # 学生端页面（⚠️ 基础文件已创建）
│   │   ├── home/                   # 学生首页（今日任务）
│   │   ├── taskDetail/             # 任务详情
│   │   ├── submission/             # 提交记录页
│   │   ├── progress/               # 学习进度
│   │   └── feedback/               # 反馈查看
│   ├── teacher/                    # 教师端页面（⚠️ 基础文件已创建）
│   │   ├── dashboard/              # 教师仪表盘
│   │   ├── students/               # 学生列表
│   │   ├── review/                 # 批改页面
│   │   └── topErrors/              # 常见错误统计
│   └── admin/                      # 管理员页面（⚠️ 基础文件已创建）
│       └── classManage/            # 班级管理
│
├── components/                     # 自定义组件（⚠️ 目录已创建，组件待开发）
│   ├── TaskCard/                   # 任务卡片组件
│   ├── TagSelector/                # 标签选择器组件
│   ├── EmptyState/                 # 空状态组件
│   └── SimpleStatsCard/           # 统计卡片组件
│
├── services/                       # API 服务层（✅ 部分完成）
│   ├── api.js                      # API 调用封装（✅ 已实现）
│   ├── auth.js                     # 认证相关 API（✅ 已实现）
│   ├── student.js                  # 学生端 API（⏭️ 待开发）
│   ├── teacher.js                  # 教师端 API（⏭️ 待开发）
│   └── admin.js                    # 管理员 API（⏭️ 待开发）
│
├── utils/                          # 工具函数（✅ 已完成）
│   ├── storage.js                  # 本地存储封装（✅ 已实现）
│   ├── format.js                   # 格式化工具（✅ 已实现）
│   └── validator.js                # 验证工具（⏭️ 待开发）
│
├── images/                         # 图片资源（⚠️ 目录已创建）
│
├── cloudfunctions/                 # 云函数目录（精简 MVP: CF1–CF8）
│   ├── auth_getOrCreateUser/       # CF1: 用户认证/创建（✅ 已实现，需适配出参）
│   ├── class_joinByInviteCode/     # CF2: 加入班级（⏭️ 待开发）
│   ├── student_getTodayPlan/       # CF3: 今日任务+状态（⏭️ 待开发）
│   ├── student_markProgress/       # CF4: 签到+提交 合并（⏭️ 待开发）
│   ├── teacher_getOverview/        # CF5: 教师今日概览（⏭️ 待开发）
│   ├── teacher_listStudentsByStatus/ # CF6: 学生名单 missing/done（⏭️ 待开发）
│   ├── teacher_saveReview/         # CF7: 保存点评（⏭️ 待开发）
│   └── admin_createClassAndInitTasks/ # CF8: 建班+初始化任务（⏭️ 待开发）
│
└── docs/                           # 文档目录（✅ 已完成）
    ├── mvp_todolist.md             # MVP 需求文档
    ├── development_plan.md          # 本开发计划
    └── database_setup.md           # 数据库设置指南（✅ 已创建）

图例：
✅ 已完成
⚠️ 部分完成
⏭️ 待开发
```

---

## 三、开发步骤详解

### 阶段 1: 项目初始化与环境搭建 (1-2 天)

#### 1.1 创建小程序项目
- [x] 在微信开发者工具中创建新项目
- [x] 配置 AppID（测试可使用测试号）
- [x] 初始化项目基础结构
- [x] 配置 `app.json` 页面路由
- [x] 配置全局样式 `app.wxss`

#### 1.2 配置 CloudBase 环境
- [x] 注册/登录腾讯云开发控制台
- [x] 创建 CloudBase 环境
- [x] 获取环境 ID
- [x] 在小程序中初始化 CloudBase SDK
- [x] 配置云函数目录

#### 1.3 创建数据库集合（精简 MVP：7 个）
- [x] users ⚠️ **已创建**（登录功能必需）
- [ ] classes
- [ ] class_members
- [ ] task_items（扁平化任务，无 task_days）
- [ ] checkins
- [ ] submissions
- [ ] reviews

**MVP 不创建**: scenarios, phrases, task_days, error_tags, assessments  
**详见**: `docs/database_setup.md`、`docs/mvp_simplified_spec.md`

#### 1.4 基础工具类开发
- [x] `utils/storage.js` - 本地存储封装（get/set/remove）
- [x] `utils/format.js` - 日期格式化等工具
- [x] `services/api.js` - 云函数调用封装

---

### 阶段 2: 认证与加入班级 (2-3 天)

#### 2.1 云函数 CF1: auth_getOrCreateUser
- [x] 创建云函数目录结构
- [x] 实现获取 openid 逻辑
- [x] 实现用户创建/查询逻辑
- [x] 返回用户信息（包含 role）
- [x] 部署并测试 ✅ **已完成**

#### 2.2 登录页面 `/pages/auth/login`
- [x] 创建页面文件（.js, .wxml, .wxss, .json）
- [x] UI: 姓名输入框（可选）
- [x] UI: 手机号输入框（可选）
- [x] UI: 登录按钮
- [x] 调用 CF1 获取/创建用户
- [x] 保存用户信息到本地存储
- [x] 根据 role 跳转到对应首页
- [x] 错误处理和用户提示 ✅ **已完成**

#### 2.3 云函数 CF2: class_joinByInviteCode
- [ ] 创建云函数目录结构
- [ ] 实现邀请码查询班级逻辑
- [ ] 实现 class_members 插入/更新逻辑
- [ ] 返回班级基本信息
- [ ] 部署并测试 ⏭️ **待开发**

#### 2.4 加入班级页面 `/pages/auth/joinClass`
- [x] 创建页面文件（基础文件已创建）
- [x] UI: 邀请码输入框
- [x] UI: 加入按钮
- [ ] 调用 CF2 加入班级 ⚠️ **待实现功能**
- [ ] 保存 currentClassId 到本地存储
- [ ] 跳转到对应角色首页

---

### 阶段 3: 学生端核心功能 (3-4 天)

#### 3.1 云函数 CF3: student_getTodayPlan（扩展返回）
- [ ] 根据 classId、date 查询 classes、task_items
- [ ] 计算 dayNumber（基于 startDate）
- [ ] 查询 checkins、submissions 返回今日状态
- [ ] 返回 `{ dayNumber, taskItems, status: { checkedIn, submittedTaskIds } }`
- [ ] 部署并测试

#### 3.2 云函数 CF4: student_markProgress（合并签到+提交）
- [ ] action="checkin" → 写入 checkins
- [ ] action="submit" → 写入 submissions（taskItemId, note?）
- [ ] 返回 `{ ok: true }`
- [ ] 部署并测试

#### 3.3 学生首页 `/pages/student/home`
- [x] 页面文件已创建（含快速体验示例数据）
- [ ] 调用 CF3 获取今日计划 + 状态
- [ ] UI: 显示 dayNumber、日期、taskItems、checkedIn、submittedTaskIds
- [ ] UI: 签到按钮 → CF4 action="checkin"
- [ ] UI: 提交按钮 → CF4 action="submit"
- [ ] 实现下拉刷新

#### 3.4 任务详情页 `/pages/student/taskDetail`
- [ ] 创建页面文件
- [ ] 接收 taskItemId 参数
- [ ] 查询 task_item 详情
- [ ] 查询关联的 phrases（通过 phraseIds 或 scenarioKey）
- [ ] UI: 显示任务信息、短语列表
- [ ] UI: 返回按钮

#### 3.5 TaskCard 组件
- [ ] 创建组件目录
- [ ] 实现任务卡片 UI
- [ ] 支持显示任务标题、状态等
- [ ] 支持点击跳转详情

---

### 阶段 4: 提交记录功能（已并入 CF4）

> 签到和提交已合并为 CF4 student_markProgress，前端统一调用。

#### 4.1 提交记录页 `/pages/student/submission`
- [ ] 获取今日任务列表（来自 CF3 或单独请求）
- [ ] UI: 显示每个任务的提交状态（submittedTaskIds）
- [ ] UI: "我已提交到微信群" 按钮 → CF4 action="submit"
- [ ] 更新 UI 状态

---

### 阶段 5: 教师端核心功能 (4-5 天)

#### 5.1 云函数 CF5: teacher_getOverview（精简版）
- [ ] 返回 `{ totalStudents, checkedInCount, submittedCount, reviewedCount }`
- [ ] 涉及 class_members, checkins, submissions, reviews
- [ ] 部署并测试

#### 5.2 云函数 CF6: teacher_listStudentsByStatus
- [ ] 只做 status: "missing"（今天没打卡/没提交）和 "done"（已完成）
- [ ] 返回 `{ students: [{ userId, name, status }] }`
- [ ] 部署并测试

#### 5.3 教师仪表盘 `/pages/teacher/dashboard`
- [ ] 页面基础文件已创建
- [ ] UI: 班级选择器、日期（默认今天）
- [ ] 调用 CF5 teacher_getOverview 获取概览
- [ ] UI: 显示 totalStudents、checkedInCount、submittedCount、reviewedCount
- [ ] UI: 按钮跳转到学生列表（missing/done）

#### 5.4 学生列表页 `/pages/teacher/students`
- [ ] 页面基础文件已创建
- [ ] UI: Tab 切换（missing / done）
- [ ] 调用 CF6 获取对应状态的学生列表
- [ ] UI: 学生列表展示（姓名、状态等）
- [ ] 点击学生跳转到批改页（传递 studentId）

#### 5.5 SimpleStatsCard 组件
- [ ] 创建组件目录
- [ ] 实现统计卡片 UI
- [ ] 支持显示数字、标题、图标等

---

### 阶段 6: 批改与反馈功能 (3-4 天)

#### 6.1 云函数 CF7: teacher_saveReview（极简）
- [ ] 入参: `{ classId, studentId, dayNumber, comment }`（先不做 tag/score）
- [ ] 出参: `{ reviewId, ok: true }`
- [ ] 部署并测试

#### 6.2 批改页 `/pages/teacher/review`
- [ ] 创建页面文件
- [ ] 接收 studentId、dayNumber 参数
- [ ] UI: 显示学生姓名
- [ ] UI: 评论输入框（CF7 极简版无 tag/score）
- [ ] UI: 保存按钮 → CF7
- [ ] 保存成功后返回上一页

#### 6.3 学生反馈页 `/pages/student/feedback`
- [ ] 创建页面文件
- [ ] 查询当前学生的 reviews 记录
- [ ] UI: 显示批改列表（按日期排序）
- [ ] UI: 显示评论（MVP 无 tag/score）
- [ ] UI: 空状态

> **MVP 砍掉**: TagSelector、topErrors 页、CF9 teacher_getTopErrors → 放 V1.1

---

### 阶段 7: 管理员功能 (2-3 天)

#### 7.0 学习进度页 `/pages/student/progress`（可选）
- [ ] 创建页面文件
- [ ] 查询 Day1-5 的 checkins 和 submissions
- [ ] UI: 显示每日完成情况（卡片或列表）
- [ ] UI: 简单统计（总完成率等）

#### 7.1 云函数 CF8: admin_createClassAndInitTasks（新增）
- [ ] 入参: `{ className, startDate, teacherUserIds?, tasks: [{ dayNumber, items }] }`
- [ ] 创建 classes、class_members、task_items
- [ ] 生成 inviteCode
- [ ] 出参: `{ classId, inviteCode }`
- [ ] 部署并测试

#### 7.2 管理员班级管理页 `/pages/admin/classManage`
- [ ] 页面基础文件已创建
- [ ] UI: 创建班级表单（className, startDate, tasks 结构）
- [ ] 调用 CF8 一键建班+初始化任务
- [ ] 显示返回的 classId、inviteCode

> **MVP 砍掉**: CF10 export_csvReports → 放 V1.1

---

### 阶段 8: 测试与优化 (2-3 天)

#### 8.1 功能测试（阶段 8）
- [ ] 学生端流程测试（登录 → 加入班级 → 查看任务 → 签到 → 提交 → 查看反馈）
- [ ] 教师端流程测试（登录 → 查看概览 → 查看学生 → 批改 → 查看统计）
- [ ] 管理员流程测试（创建班级 → 初始化任务）
- [ ] 边界情况测试（无数据、错误输入等）

#### 8.2 UI/UX 优化
- [ ] 统一样式风格
- [ ] 优化加载状态（loading）
- [ ] 优化错误提示（toast）
- [ ] 优化空状态展示
- [ ] 响应式适配

#### 8.3 性能优化
- [ ] 减少不必要的云函数调用
- [ ] 优化数据库查询
- [ ] 添加缓存机制（如适用）

#### 8.4 代码整理
- [ ] 代码注释完善
- [ ] 统一代码风格
- [ ] 移除调试代码
- [ ] 优化文件结构

---

## 四、关键技术点

### 4.1 认证流程
1. 用户打开小程序 → 调用 `wx.cloud.callFunction('auth_getOrCreateUser')`
2. CloudBase 自动获取 openid（无需手动调用 wx.login）
3. 云函数查询/创建用户记录
4. 前端保存用户信息到本地存储

### 4.2 路由守卫
- 在 `app.js` 的 `onLaunch` 中检查登录状态
- 未登录跳转到登录页
- 已登录但无班级跳转到加入班级页
- 根据 role 跳转到对应首页

### 4.3 数据查询优化
- 使用数据库索引（_id, classId, userId, dayNumber 等）
- 避免全表扫描
- 合理使用聚合查询

### 4.4 错误处理
- 统一错误处理机制（在 `services/api.js` 中）
- 友好的错误提示（使用 `wx.showToast`）
- 网络错误重试机制

---

## 五、开发注意事项

1. **UI 语言**: 所有界面文字使用中文
2. **代码组织**: API 调用统一放在 `/services` 目录
3. **本地存储**: 使用封装好的 storage 工具，存储 userId、role、currentClassId
4. **云函数**: 每个云函数独立目录，包含 `index.js` 和 `package.json`
5. **数据库权限**: 配置合适的数据库权限（读取、写入规则）
6. **测试数据**: 准备测试用的种子数据（scenarios、phrases、error_tags 等）
7. **版本控制**: 忽略 `node_modules`、`.DS_Store` 等文件

---

## 六、预计时间线（精简 MVP）

- **阶段 1-2**: 3-5 天（基础搭建 + 认证）✅ 进行中
- **阶段 3-4**: 4-5 天（学生端 CF3+CF4 + 页面）
- **阶段 5-6**: 5-6 天（教师端 CF5+CF6+CF7 + 页面）
- **阶段 7**: 2-3 天（管理员 CF8 + 建班页）
- **阶段 8**: 2-3 天（测试与优化）

**总计**: 约 16-22 个工作日（3-4 周）

> CF9 topErrors、CF10 export 砍掉，放 V1.1

---

## 七、当前进度总结

### ✅ 已完成（阶段 1-2 部分）

**项目基础搭建**:
- ✅ 项目结构已创建（所有目录和基础文件）
- ✅ 小程序入口文件（app.js, app.json, app.wxss）
- ✅ 所有页面基础文件已创建（12个页面，48个文件）
- ✅ CloudBase 环境已配置

**基础工具类**:
- ✅ `utils/storage.js` - 本地存储封装
- ✅ `utils/format.js` - 日期格式化工具
- ✅ `services/api.js` - 云函数调用封装
- ✅ `services/auth.js` - 认证 API 封装

**认证功能**:
- ✅ 云函数 CF1: `auth_getOrCreateUser` - 已实现并部署
- ✅ 登录页面 - 完整功能已实现（UI + 逻辑 + 错误处理）
- ✅ 登录状态检查逻辑（app.js）
- ✅ 路由守卫逻辑

**数据库**:
- ✅ `users` 集合已创建（登录功能必需）
- ⚠️ 其他集合待创建（可按需逐步创建）

**页面基础文件**:
- ✅ 所有 12 个页面的基础文件已创建（.js, .wxml, .wxss, .json）
- ⚠️ 大部分页面功能待实现（仅登录页面功能完整）

### ⏭️ 下一步（按优先级）

**1. 建 classes + class_members 集合**

**2. 做 CF2 + joinClass 页面** → 跑通入班入口

**3. 做 CF3 + CF4** → 跑通学生端闭环（看任务 → 打卡/提交）

**后续**: CF5–CF8、教师端、管理员端

### 📊 完成度统计

- **阶段 1**: 90% ✅
- **阶段 2**: 50% 🚧（登录完成，加入班级待开发）
- **阶段 3–8**: 0% ⏭️

**总体进度**: 约 15–20%

### 📋 精简 MVP 参考

- **云函数**: CF1–CF8（详见 `docs/mvp_simplified_spec.md`）
- **数据库**: 7 个集合（users, classes, class_members, task_items, checkins, submissions, reviews）

---

## 八、下一步行动

1. ✅ 确认技术栈选择
2. ✅ 创建项目结构
3. ✅ 配置 CloudBase 环境
4. ✅ 阶段 1–2 部分完成（登录功能）
5. ⏭️ **下一步**: 建 classes + class_members → CF2 + joinClass 页面 → CF3 + CF4 学生端闭环

