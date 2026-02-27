# MVP 精简规范 - 最小云函数集合（CF1–CF8）

## 云函数清单

### CF1 auth_getOrCreateUser ✅ 已实现（需适配出参）

**目的**: 微信登录、创建/读取用户、返回 role  
**入参**: `{ name }`（必填）  
**出参**: `{ userId, role, hasClass, currentClassId? }`  
**涉及集合**: users

---

### CF2 class_joinByInviteCode

**目的**: 输入邀请码加入班级，根据学生码/教师码决定角色  
**入参**: `{ inviteCode }`  
**出参**: `{ classId, className, roleInClass }`  
**涉及集合**: classes, class_members

- 学生码 → `roleInClass=student`
- 教师码 → `roleInClass=teacher`
- 支持升级：学生用教师码可升为教师

---

### CF3 student_getTodayPlan（扩展返回）

**目的**: 学生首页拉取「今天任务 + 今天状态」  
**入参**: `{ classId, date? }`（date 可选，默认今天）  
**出参**:

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

### CF4 student_markProgress（合并原 CF4+CF5）

**目的**: 签到 + 提交 合并为一个动作接口  
**入参**（二选一）:

- 打卡: `{ classId, dayNumber, action: "checkin" }`
- 提交: `{ classId, dayNumber, action: "submit", taskItemId, note? }`

**出参**: `{ ok: true }`  
**涉及集合**: checkins, submissions

> 前端所有按钮都调同一个 CF，少维护一个云函数

---

### CF5 teacher_getOverview（精简版原 CF6）

**目的**: 老师仪表盘只拿「今天概览」  
**入参**: `{ classId, dayNumber }` 或 `{ classId, date }`  
**出参**:

```json
{
  "totalStudents": 10,
  "checkedInCount": 8,
  "submittedCount": 6,
  "reviewedCount": 3
}
```

**涉及集合**: class_members, checkins, submissions, reviews

---

### CF6 teacher_listStudentsByStatus

**目的**: 老师查看「未完成名单 / 已完成名单」  
**入参**: `{ classId, dayNumber, status: "missing" | "done" }`  
**出参**:

```json
{
  "students": [
    { "userId": "...", "name": "...", "status": "..." }
  ]
}
```

**涉及集合**: class_members, users, checkins, submissions, reviews(可选)

> MVP 只做 missing（今天没打卡/没提交）和 done（今天已完成）

---

### CF7 teacher_saveReview

**目的**: 老师给学生写一句点评（先不做 tag/score）  
**入参**: `{ classId, studentId, dayNumber, comment }`  
**出参**: `{ reviewId, ok: true }`  
**涉及集合**: reviews

---

### CF8 admin_createClassAndInitTasks（新增）

**目的**: 创建班级 + 生成邀请码 + 初始化任务（Day1–5）  
**入参**:

```json
{
  "className": "...",
  "startDate": "YYYY-MM-DD",
  "teacherUserIds": [],
  "tasks": [
    {
      "dayNumber": 1,
      "items": [
        { "title": "...", "content": "...", "order": 1 }
      ]
    }
  ]
}
```

**出参**: `{ classId, studentInviteCode, teacherInviteCode }`  
**涉及集合**: classes, class_members, task_items

> 创建时生成两个邀请码，分别给学生和教师使用

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
| users         | 用户表                   |
| classes       | 班级表                   |
| class_members | 班级成员表                 |
| task_items    | 任务项表（扁平化，无 task_days） |
| checkins      | 签到表                   |
| submissions   | 提交记录表                 |
| reviews       | 批改记录表                 |


**MVP 不创建**: scenarios, phrases, task_days, error_tags, assessments

---

