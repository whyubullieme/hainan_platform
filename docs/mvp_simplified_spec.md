# MVP 精简规范 - 最小云函数集合（CF1–CF8）

> **文档更新**: 已按当前 codebase 实际实现同步（2026-03-02）

## 云函数清单

### CF1 auth_getOrCreateUser ✅ 已实现

**目的**: 微信登录、创建/读取用户、返回 role  
**入参**: `{ name }`（必填）  
**出参**: `{ errCode, errMsg, userId, role, hasClass, currentClassId?, user }`  
**涉及集合**: users

- 成功时 `errCode: 0`，失败返回 `errCode: -1` 及 `errMsg`
- `user` 含 name、role 等，不含 openid

---

### auth_adminLogin ✅ 已实现（扩展）

**目的**: 管理员密码登录（无微信 openid 时使用）  
**入参**: `{ password, name? }` 首次创建时 name 必填  
**出参**: `{ errCode, errMsg, user }`  
**涉及集合**: users

- 密码固定为 `test123`（开发环境）

---

### CF2 class_joinByInviteCode ✅ 已实现

**目的**: 输入邀请码加入班级，根据学生码/教师码决定角色  
**入参**: `{ inviteCode }`  
**出参**: `{ errCode, errMsg, classId, className, roleInClass }`  
**涉及集合**: classes, class_members

- 支持 `studentInviteCode`、`teacherInviteCode`（以及旧字段 `inviteCode` 兼容）
- 学生码 → `roleInClass=student`，教师码 → `roleInClass=teacher`
- 支持升级：学生用教师码可升为教师

---

### CF3 student_getTodayPlan ✅ 已实现

**目的**: 学生首页拉取「今天任务 + 今天状态」  
**入参**: `{ classId, date? }`（date 可选，默认今天 YYYY-MM-DD）  
**出参**: `{ errCode, errMsg, dayNumber, taskItems, status }`

```json
{
  "dayNumber": 1,
  "taskItems": [
    { "taskItemId": "...", "title": "...", "content": "...", "order": 1 }
  ],
  "status": {
    "checkedIn": true,
    "submittedTaskIds": ["task1", "task2"]
  }
}
```

**涉及集合**: classes, task_items, checkins, submissions

> 一次请求拿到学生首页所需的全部数据

---

### CF4 student_markProgress ✅ 已实现（合并原 CF4+CF5）

**目的**: 签到 + 提交 合并为一个动作接口  
**入参**（二选一）:

- 打卡: `{ classId, dayNumber, action: "checkin" }`
- 提交: `{ classId, dayNumber, action: "submit", taskItemId, note? }`

**出参**: `{ errCode, errMsg, ok: true }`  
**涉及集合**: checkins, submissions

> 前端所有按钮都调同一个 CF
> 开发阶段：不允许超前做作业，仅允许今日及已过去的日期
> 重复打卡/提交时返回成功（幂等）

---

### student_getMySubmissions ✅ 已实现（扩展）

**目的**: 学生查看提交记录，支持按日期筛选  
**入参**: `{ classId, date? }` date 可选 YYYY-MM-DD，不传返回全部  
**出参**: `{ errCode, errMsg, startDate, records }`  
**records**: `[{ dayNumber, dateStr, taskItemId, taskTitle, submittedAt }]`

---

### student_getFullPlan ✅ 已实现（扩展）

**目的**: 学生查看完整训练计划（全部任务）  
**入参**: `{ classId }`  
**出参**: `{ errCode, errMsg, startDate, days }`

- 每 day: `{ dayNumber, dateStr, status, tasks, submittedTaskIds }`；无任务时 tasks 为空，前端显示「待教师添加」
- totalDays 取自 class.totalDays，默认 14
- status: `locked` | `today` | `expired`

---

### student_getTaskDetail ✅ 已实现（扩展）

**目的**: 学生获取单个任务详情（含任务类型）  
**入参**: `{ taskId }`  
**出参**: `{ errCode, errMsg, taskItem }`  
**taskItem**: `{ taskItemId, title, content, taskType, dayNumber, order }`  
**taskType**: `read_along`(跟读) | `read_aloud`(朗读)

---

### student_getMyReviews ✅ 已实现（扩展）

**目的**: 学生查看老师给自己的点评列表  
**入参**: `{ classId }`  
**出参**: `{ errCode, errMsg, reviews }`  
**reviews**: `[{ _id, dayNumber, comment, teacherName, createdAt }]`

---

### CF5 teacher_getOverview ✅ 已实现

**目的**: 老师仪表盘只拿「今天概览」  
**入参**: `{ classId, dayNumber? }` 或 `{ classId, date? }`，不传则用当天  
**出参**: `{ errCode, errMsg, totalStudents, checkedInCount, submittedCount, reviewedCount, dayNumber }`

**涉及集合**: class_members, checkins, submissions, reviews

- admin 或班级教师可调用

---

### CF6 teacher_listStudentsByStatus ✅ 已实现

**目的**: 老师查看「未完成名单 / 已完成名单」  
**入参**: `{ classId, dayNumber, status: "missing" | "done" }`  
**出参**: `{ errCode, errMsg, students }`

```json
{
  "students": [
    { "userId": "...", "name": "...", "status": "...", "hasCheckin": true, "hasSubmission": true }
  ]
}
```

**涉及集合**: class_members, users, checkins, submissions

> missing = 今天未完成（缺打卡或提交），done = 今天已完成
> admin 或班级教师可调用

---

### CF7 teacher_saveReview ✅ 已实现

**目的**: 老师给学生写一句点评（按天，无 tag/score）  
**入参**: `{ classId, studentId, dayNumber, comment }`  
**出参**: `{ errCode, errMsg, reviewId, ok: true }`  
**涉及集合**: reviews

- 同一学生同一天同教师：更新已有点评，否则新建
- reviews 存 teacherName 供前端展示

---

### CF8 admin_createClassAndInitTasks ✅ 已实现

**目的**: 创建班级 + 生成双邀请码 + 初始化任务  
**入参**:

```json
{
  "className": "...",
  "startDate": "YYYY-MM-DD",
  "teacherUserIds": [],
  "tasks": [ { "dayNumber": 1, "items": [ { "title": "...", "content": "...", "order": 1 } ] } ]
}
```

- `teacherUserIds`、`tasks`、`totalDays` 可选；totalDays 默认 14（1–90）
- 不传 tasks 则按 totalDays 初始化任务，Day1–5 有预设标题，Day6+ 为「综合练习 N」

**出参**: `{ errCode, errMsg, classId, studentInviteCode, teacherInviteCode }`  
**涉及集合**: classes, task_items

> 仅 admin 可调用。teacherUserIds 暂未写入 class_members，需通过邀请码或 admin_addMember 加入

---

### teacher_addDayTasks ✅ 已实现（扩展）

**目的**: 教师为班级添加一天任务（从模板取标题）  
**入参**: `{ classId }`  
**出参**: `{ errCode, errMsg, dayNumber, ok: true }`  
**涉及集合**: task_items

- admin 或班级教师可调用

---

### 管理员班级管理 ✅ 已实现

| 云函数 | 目的 | 入参 | 出参 |
|--------|------|------|------|
| admin_listClasses | 获取所有班级（含成员统计） | 无 | `{ errCode, errMsg, classes }` classes 含 studentCount, teacherCount |
| admin_getClassDetail | 获取班级详情 + 成员列表 | `{ classId }` | `{ errCode, errMsg, class, members }` |
| admin_updateClass | 更新班级 | `{ classId, name?, startDate?, endDate?, totalDays? }` totalDays 修改后自动重算 endDate | `{ errCode, errMsg, ok }` |
| admin_deleteClass | 删除班级（级联删除 class_members） | `{ classId }` | `{ errCode, errMsg, ok }` |
| admin_listUsers | 搜索用户（按姓名） | `{ keyword?, limit? }` | `{ errCode, errMsg, users }` |
| admin_addMember | 添加班级成员 | `{ classId, userId, roleInClass }` | `{ errCode, errMsg, ok }` |
| admin_updateMemberRole | 更新成员角色 | `{ classId, memberId, roleInClass }` | `{ errCode, errMsg, ok }` |
| admin_removeMember | 移出成员 | `{ classId, memberId }` | `{ errCode, errMsg, ok }` |

---

## 实现状态汇总

| 云函数 | 状态 |
|--------|------|
| CF1 auth_getOrCreateUser | ✅ |
| auth_adminLogin | ✅ 扩展 |
| CF2 class_joinByInviteCode | ✅ |
| CF3 student_getTodayPlan | ✅ |
| CF4 student_markProgress | ✅ |
| student_getTaskDetail | ✅ 扩展 |
| student_getMySubmissions | ✅ 扩展 |
| student_getFullPlan | ✅ 扩展 |
| student_getMyReviews | ✅ 扩展 |
| CF5 teacher_getOverview | ✅ |
| CF6 teacher_listStudentsByStatus | ✅ |
| CF7 teacher_saveReview | ✅ |
| CF8 admin_createClassAndInitTasks | ✅ |
| teacher_addDayTasks | ✅ 扩展 |
| admin_listClasses / getClassDetail / updateClass / deleteClass / listUsers / addMember / updateMemberRole / removeMember | ✅ |

---

## 旧 CF → 新 CF 映射

| 旧 CF                                               | 新 CF                                   |
| -------------------------------------------------- | -------------------------------------- |
| CF1 auth_getOrCreateUser                           | CF1 ✅ 保留                               |
| CF2 class_joinByInviteCode                         | CF2 ✅ 保留                               |
| CF3 student_getTodayPlan                           | CF3 ✅ 保留（扩展返回）                         |
| CF4 student_checkin + CF5 student_recordSubmission | CF4 student_markProgress 🔀 合并         |
| CF6 teacher_getClassOverview                       | CF5 teacher_getOverview 精简             |
| CF7 teacher_listStudentsByStatus                   | CF6 ✅ 保留（状态缩减）                         |
| CF8 teacher_saveReview                             | CF7 ✅ 保留（字段缩减）                         |
| —                                                  | CF8 admin_createClassAndInitTasks ➕ 新增 |
| CF9 teacher_getTopErrors                           | ❌ MVP 砍掉，放 V1.1                        |
| CF10 export_csvReports                             | ❌ MVP 砍掉，放 V1.1                        |


---

## 最小数据库集合（7 个）

| 集合            | 说明                    |
| ------------- | --------------------- |
| users         | 用户表 _id, openid, name, role, orgName?, createdAt, updatedAt |
| classes       | 班级表 _id, name, startDate, endDate, **totalDays** (课程天数), studentInviteCode, teacherInviteCode, createdAt, updatedAt |
| class_members | 班级成员表 _id, classId, userId, **roleInClass**, joinedAt, status |
| task_items    | 任务项表 _id, classId, dayNumber, order, title, content?, **taskType** (read_along|read_aloud), createdAt, updatedAt |
| checkins      | 签到表 _id, classId, userId, dayNumber, status, createdAt |
| submissions   | 提交记录表 _id, classId, userId, dayNumber, taskItemId, channel, note?, status, createdAt |
| reviews       | 批改记录表 _id, classId, studentId, teacherId, dayNumber, comment, teacherName?, createdAt, updatedAt |

**MVP 不创建**: scenarios, phrases, task_days, error_tags, assessments

---

## 前端页面与路由

| 路由 | 说明 |
|------|------|
| pages/auth/login | 登录（CF1 / auth_adminLogin） |
| pages/auth/joinClass | 入班（CF2） |
| pages/student/home | 学生首页（CF3） |
| pages/student/taskDetail | 任务详情（跟读/朗读类型、「我已提交」） |
| pages/student/submission | 提交记录（CF4 submit） |
| pages/student/progress | 学习进度（各天签到与任务完成） |
| pages/student/myTasks | 完整计划（student_getFullPlan），分页 7 天/页，显示「共 X 天」 |
| pages/student/feedback | 老师点评（student_getMyReviews） |
| pages/teacher/dashboard | 教师仪表盘（CF5） |
| pages/teacher/students | 学生名单（CF6） |
| pages/teacher/review | 点评编辑（CF7） |
| pages/teacher/topErrors | 高频错误（❌ CF9 已砍，页面占位） |
| pages/admin/classManage | 班级管理（CF8 + admin_*） |
| pages/admin/classDetail | 班级详情 |

---

## 前端 Services

| 文件 | 云函数调用 |
|------|-----------|
| services/auth.js | auth_getOrCreateUser, auth_adminLogin |
| services/class.js | class_joinByInviteCode |
| services/student.js | student_getTodayPlan, student_markProgress, student_getMySubmissions, student_getMyReviews, student_getFullPlan, student_getTaskDetail |
| services/teacher.js | teacher_getOverview, teacher_listStudentsByStatus, teacher_saveReview, teacher_addDayTasks |
| services/admin.js | admin_createClassAndInitTasks, admin_listClasses, admin_getClassDetail, admin_updateClass, admin_deleteClass, admin_listUsers, admin_addMember, admin_updateMemberRole, admin_removeMember |

---

