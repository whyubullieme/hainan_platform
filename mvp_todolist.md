# WeChat Mini Program MVP (CloudBase) - Cursor Build List

> **精简 MVP 规范**: 参见 `docs/mvp_simplified_spec.md`（CF1–CF8、7 个集合）

## Product Scope (MVP Demo)
- Student: login/join class, view daily tasks, check-in, submit "wechat audio submitted" record, view feedback
- Teacher: class overview, student list by status, review with error tags + comments, top error tags summary
- Admin (minimal): create class + invite code, assign teacher

Out of scope now:
- in-app audio upload/playback
- AI pronunciation scoring
- payment/subscription
- live/recorded course streaming
- complex exams/community

---

## Tech Stack (MVP)
- WeChat Mini Program (native)
- CloudBase: Cloud Database + Cloud Functions
- Auth: simplest workable (CloudBase login / openid-based) + role stored in DB
- Export: CSV only (no PDF)

---

## Data Model (Cloud Database Collections)

### 1) users
Fields:
- _id
- openid
- name
- phone (optional)
- role: "student" | "teacher" | "admin"
- orgName (optional)
- createdAt, updatedAt

### 2) classes
Fields:
- _id
- name
- startDate (YYYY-MM-DD)
- endDate (YYYY-MM-DD)
- inviteCode (string)
- teacherIds (array of userIds)
- createdAt, updatedAt

### 3) class_members
Fields:
- _id
- classId
- userId
- joinedAt
- status: "active" | "inactive"

### 4) scenarios
Fields:
- _id
- key: "checkin" | "checkout" | "phone" | "complaint" | "hainan" | "policy"
- title
- order

### 5) phrases
Fields:
- _id
- scenarioKey
- enText
- zhIntent
- slots (array of strings)        # optional
- commonMistakes (string)         # optional
- createdAt, updatedAt

### 6) task_days
Fields:
- _id
- classId
- dayNumber (1..5)
- title
- date (YYYY-MM-DD)               # optional if computed by startDate
- createdAt, updatedAt

### 7) task_items
Fields:
- _id
- classId
- dayNumber (1..5)
- order
- scenarioKey
- title
- phraseIds (array of phraseIds)  # optional
- createdAt, updatedAt

### 8) checkins
Fields:
- _id
- classId
- userId
- dayNumber
- taskItemId (optional)
- status: "done" | "skip"
- difficulty (1..5 optional)
- createdAt

### 9) submissions
Fields:
- _id
- classId
- userId
- dayNumber
- taskItemId
- channel: "wechat_group"
- note (optional: msg timestamp/number)
- status: "recorded"
- createdAt

### 10) error_tags
Fields:
- _id
- key (e.g., "pronunciation", "intonation", "flow", "politeness", "procedure", "accuracy")
- title
- order

### 11) reviews
Fields:
- _id
- classId
- studentId
- teacherId
- dayNumber
- taskItemId
- tagKeys (array of error_tag.key)
- comment (string)
- score (0..10 optional)
- createdAt, updatedAt

### 12) assessments (optional in MVP, can be stub)
Fields:
- _id
- classId
- studentId
- teacherId
- totalScore (0..100 optional)
- note (string)
- createdAt

---

## Cloud Functions (Minimum Set)

### CF1: auth_getOrCreateUser
Input: { name?, phone? }
- get openid from context
- create users doc if not exists
Return: user profile

### CF2: class_joinByInviteCode
Input: { inviteCode }
- find class by inviteCode
- upsert class_members
Return: class basic info

### CF3: student_getTodayPlan
Input: { classId }
- compute dayNumber by (today - class.startDate + 1), clamp 1..5
- fetch task_items for that dayNumber
Return: { dayNumber, taskItems[] }

### CF4: student_checkin
Input: { classId, dayNumber, taskItemId?, status, difficulty? }
- upsert checkins record for user/day/task
Return: ok

### CF5: student_recordSubmission
Input: { classId, dayNumber, taskItemId, note? }
- create submissions record (channel=wechat_group)
Return: ok

### CF6: teacher_getClassOverview
Input: { classId, dayNumber }
- count members
- count checkins (distinct students)
- count submissions (distinct students)
Return: overview metrics + missing lists (optional)

### CF7: teacher_listStudentsByStatus
Input: { classId, dayNumber, status: "missing"|"submitted"|"reviewed" }
- "missing": members who have no submission record for dayNumber
- "submitted": has submission but no review
- "reviewed": has review
Return: student list

### CF8: teacher_saveReview
Input: { classId, studentId, dayNumber, taskItemId, tagKeys[], comment, score? }
- upsert reviews
Return: ok

### CF9: teacher_getTopErrors
Input: { classId, range: "today"|"all", dayNumber? }
- aggregate reviews tagKeys frequency
Return: ranked list

### CF10: export_csvReports
Input: { classId, range/dayNumber }
- generate CSV for:
  - completion/checkin stats
  - top error tags
  - student status list
Return: { fileUrl } or raw csv text

---

## Mini Program Pages (Routes) + Acceptance

### Page: /pages/auth/login
- Show: name/phone optional
- Button: login -> call CF1 -> store user in local storage

### Page: /pages/auth/joinClass
- input inviteCode
- call CF2
- store currentClassId

### Page: /pages/student/home
- call CF3 -> show dayNumber + task list
- each task -> go to taskDetail
- show buttons:
  - checkin (calls CF4)
  - record submission (jump to submission page)

### Page: /pages/student/taskDetail
- show task info + related phrases (fetch phrases by ids or scenario)
- link back

### Page: /pages/student/submission
- list tasks for today
- for each: "I submitted in WeChat" -> call CF5
- status display

### Page: /pages/student/progress
- show Day1..Day5 completion summary (use checkins/submissions)
- simple metrics only

### Page: /pages/student/feedback
- list reviews for me (query reviews collection directly or via CF)
- show tags + comment + score

### Page: /pages/teacher/dashboard
- choose class + dayNumber (default today)
- call CF6 show overview counts
- buttons to student list by status
- link to topErrors

### Page: /pages/teacher/students
- tabs: missing/submitted/reviewed
- call CF7
- click a student -> go review page

### Page: /pages/teacher/review
- show student + tasks
- Tag selector component (multi-select from error_tags)
- comment input + score optional
- save -> CF8

### Page: /pages/teacher/topErrors
- call CF9
- show ranked tags + counts

### Page: /pages/admin/classManage (minimal)
- create class: name/startDate/endDate -> generate inviteCode
- assign teacherIds
- seed task_days/task_items for Day1..Day5 (can be a button, or import)

---

## UI Components Needed
- TaskCard
- TagSelector (multi select list)
- EmptyState
- SimpleStatsCard

---

## Development Order (精简 MVP)

1) Setup CloudBase env + collections + basic auth CF1 ✅
2) Join class CF2 + joinClass page
3) Student home CF3 + markProgress CF4 (签到+提交合并)
4) Teacher overview CF5 + student list CF6
5) Review save CF7 + student feedback page
6) Admin createClass CF8 + classManage page

> CF9 topErrors、CF10 export → V1.1

---

## Notes
- Keep all API calls in /services/* so future refactor is easy
- Use local storage for session: userId, role, currentClassId
- WIP: keep it demo-stable, avoid extra features
