# 数据库集合创建指南（精简 MVP）

## 问题说明

如遇错误 `database collection not exists`，需在云开发控制台创建对应集合。

## 最小集合（7 个）

MVP 只需以下 7 个集合：


| 集合                | 说明                    |
| ----------------- | --------------------- |
| **users**         | 用户表                   |
| **classes**       | 班级表                   |
| **class_members** | 班级成员表                 |
| **task_items**    | 任务项表（扁平化，无 task_days） |
| **checkins**      | 签到表                   |
| **submissions**   | 提交记录表                 |
| **reviews**       | 批改记录表                 |


**MVP 不创建**: scenarios, phrases, task_days, error_tags, assessments

---

## 创建步骤

### 1. 打开云开发控制台

1. 微信开发者工具 → 顶部「云开发」
2. 选择「数据库」
3. 点击「创建集合」

### 2. 逐个创建 7 个集合

**建议顺序**:

1. **users** ⚠️ 登录功能必需
2. **classes** - 加入班级、建班
3. **class_members** - 成员关系
4. **task_items** - 任务数据
5. **checkins** - 签到
6. **submissions** - 提交
7. **reviews** - 批改

### 3. 权限设置

开发阶段建议：**所有用户可读，仅创建者可写**

---

## 集合结构参考

### users

- `_id`, `openid`, `name`, `phone?`, `role`, `orgName?`, `createdAt`, `updatedAt`

### classes

- `_id`, `name`, `startDate`, `endDate`, `totalDays` (课程总天数，默认 14), `studentInviteCode`, `teacherInviteCode`, `createdAt`, `updatedAt`

### class_members

- `_id`, `classId`, `userId`, `roleInClass` ("student" | "teacher"), `joinedAt`, `status`

### task_items

- `_id`, `classId`, `dayNumber`, `order`, `title`, `content?`, `taskType` (read_along | read_aloud), `createdAt`, `updatedAt`
- **V2.0 判分配置**：`expectedAnswer?`, `acceptedAnswers?` (string[]), `keywords?` (string[]), `scoringConfig?` (`{ semanticWeight, pronWeight, semanticPassLine?, pronPassLine? }`)

### checkins

- `_id`, `classId`, `userId`, `dayNumber`, `taskItemId?`, `status`, `createdAt`

### submissions

- `_id`, `classId`, `userId`, `dayNumber`, `taskItemId`, `channel`, `note?`, `audioFileId?`, `audioFileName?`, `status`, `createdAt`, `updatedAt?`
- **V2.0 评测字段**：`asrText?`, `semanticScore?`, `pronScore?`, `finalScore?`, `semanticPassed?`, `pronDetails?`, `evaluationStatus?` (pending | running | completed | failed), `evaluationError?`

### reviews

- `_id`, `classId`, `studentId`, `teacherId`, `dayNumber`, `comment`, `createdAt`, `updatedAt`

---

## 下一步

1. 创建 `users` 后可测试登录
2. 创建 `classes`、`class_members` 后可跑通 CF2 加入班级
3. 其他集合按功能开发进度创建

