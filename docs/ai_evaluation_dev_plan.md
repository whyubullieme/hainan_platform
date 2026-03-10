# AI 评测 V2.0 开发计划

> 扩展数据模型、题目可判分配置、提交后触发评测、AI 评测云函数、评测结果展示

---

## 开发计划总览（1–10 项）

| 序号 | 模块 | 说明 |
|------|------|------|
| 1 | 数据模型扩展 | submissions 增加评测字段；task_items 增加判分配置；更新 `docs/database_setup.md` |
| 2 | 题目可判分配置 | task_items 增加 expectedAnswer、acceptedAnswers、keywords、scoringConfig；教师 addTask 页支持配置 |
| 3 | 提交接口升级 | student_markProgress `action=submit` 成功后触发评测任务（同步或异步） |
| 4 | AI 评测云函数 | 新建 `ai_evaluateSubmission`：ASR → 语义判分 → 发音判分 → 融合总分 → 回写 submissions |
| 5 | 查询评测结果接口 | 扩展 `student_getMySubmissions` 返回 evaluationStatus/finalScore/semanticPassed 等 |
| 6 | 学生端任务详情页 | taskDetail 展示：识别文本、语义是否正确、发音分、总分、纠音建议；轮询刷新 |
| 7 | 学生端提交记录页 | submission 页显示每条提交的评测状态与总分 |
| 8 | 教师点评页接入 AI | teacher_getStudentSubmissions 返回 AI 字段；review 页展示语义是否通过 + 发音分 + 错词提示 |
| 9 | 通信与配置 | API Key、ASR/评测供应商地址放到云函数环境变量 |
| 10 | 测试与验收 | 扩展 `docs/test_plan_v1.md` V2.0 用例 |

---

## 第 1–5 项：云函数接口定义与 JSON 契约

### 1. 数据模型扩展（submissions）

**新增字段（写入 submissions 集合）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `asrText` | string | ASR 识别文本 |
| `semanticScore` | number | 语义判分 0–100 |
| `pronScore` | number | 发音判分 0–100 |
| `finalScore` | number | 融合总分 0–100 |
| `semanticPassed` | boolean | 语义是否通过 |
| `pronDetails` | object | 发音详情 { words?: [], totalScore?, fluency?, accuracy? } |
| `evaluationStatus` | string | `pending` \| `running` \| `completed` \| `failed` |
| `evaluationError` | string | 评测失败时的错误信息 |

---

### 2. 数据模型扩展（task_items）

**新增字段（题目可判分配置）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `expectedAnswer` | string | 标准答案（主答案） |
| `acceptedAnswers` | string[] | 可接受的同义答案列表 |
| `keywords` | string[] | 必含关键词，用于快速语义判定 |
| `scoringConfig` | object | `{ semanticWeight, pronWeight, semanticPassLine?, pronPassLine? }` |

---

### 3. student_markProgress（扩展 action=submit）

**入参（不变，沿用现有）：**

```json
{
  "classId": "xxx",
  "dayNumber": 1,
  "action": "submit",
  "taskItemId": "xxx",
  "note": "可选，跟读时必填",
  "audioFileId": "cloud://xxx",
  "audioFileName": "录音.mp3"
}
```

**出参（成功时新增 submissionId）：**

```json
{
  "errCode": 0,
  "errMsg": "success",
  "ok": true,
  "updated": false,
  "submissionId": "xxx"
}
```

**行为：**
- 提交成功后，若任务含 `audioFileId` 且 `task_items.scoringConfig` 存在（或按全局默认开启评测），则调用 `ai_evaluateSubmission` 进行评测。
- 可同步调用（等待评测完成再返回）或异步触发（立即返回，评测后台进行）。推荐**异步**，避免超时。

---

### 4. ai_evaluateSubmission（新建云函数）

**入参：**

```json
{
  "submissionId": "xxx"
}
```

**内部流程：**
1. 根据 `submissionId` 查出 submission，拉取 `audioFileId`、`taskItemId`
2. 拉取 task_items 的 `expectedAnswer`、`acceptedAnswers`、`keywords`、`scoringConfig`
3. 拉取音频 → ASR 得到 `asrText`
4. 语义判分：先规则（数字+关键词匹配），再 LLM 兜底“答非所问”
5. 发音判分：调用第三方口语评测 API（讯飞/腾讯云等）
6. 融合总分：`finalScore = semanticWeight * semanticScore + pronWeight * pronScore`
7. 回写 submissions：`asrText`、`semanticScore`、`pronScore`、`finalScore`、`semanticPassed`、`pronDetails`、`evaluationStatus`、`evaluationError`

**出参（内部调用，供 student_markProgress 或定时任务调用）：**

```json
{
  "errCode": 0,
  "errMsg": "success",
  "submissionId": "xxx",
  "evaluationStatus": "completed",
  "asrText": "识别出的文本",
  "semanticScore": 85,
  "pronScore": 72,
  "finalScore": 78,
  "semanticPassed": true
}
```

**失败时：**

```json
{
  "errCode": -1,
  "errMsg": "ASR 失败: xxx",
  "submissionId": "xxx",
  "evaluationStatus": "failed",
  "evaluationError": "ASR 失败: 音频无效"
}
```

---

### 5. student_getMySubmissions（扩展返回）

**入参（不变）：**

```json
{
  "classId": "xxx",
  "date": "2026-03-09"
}
```

**出参（扩展 records 每一项）：**

```json
{
  "errCode": 0,
  "errMsg": "success",
  "startDate": "2026-03-01",
  "records": [
    {
      "dayNumber": 1,
      "dateStr": "2026-03-01",
      "taskItemId": "xxx",
      "taskTitle": "入住场景对话练习",
      "note": "",
      "audioFileId": "cloud://xxx",
      "audioFileName": "录音.mp3",
      "submittedAt": "2026-03-01T10:00:00.000Z",
      "submissionId": "xxx",
      "evaluationStatus": "completed",
      "asrText": "Hello, I'd like to check in",
      "semanticScore": 90,
      "pronScore": 75,
      "finalScore": 82,
      "semanticPassed": true,
      "pronDetails": {
        "totalScore": 75,
        "fluency": 80,
        "accuracy": 70,
        "words": []
      },
      "evaluationError": null
    }
  ]
}
```

**evaluationStatus 取值：**
- `pending`：未开始评测
- `running`：评测中
- `completed`：评测完成
- `failed`：评测失败（有 `evaluationError`）

---

### 5b. student_getSubmissionEvaluation（可选，按提交单条查询）

若需「按 submissionId 单条拉评测结果」，可新建此云函数：

**入参：**

```json
{
  "submissionId": "xxx"
}
```

**出参：**

```json
{
  "errCode": 0,
  "errMsg": "success",
  "submissionId": "xxx",
  "evaluationStatus": "completed",
  "asrText": "识别出的文本",
  "semanticScore": 85,
  "pronScore": 72,
  "finalScore": 78,
  "semanticPassed": true,
  "pronDetails": {
    "totalScore": 72,
    "fluency": 78,
    "accuracy": 66,
    "words": [
      { "word": "hello", "score": 80, "errorType": null }
    ]
  },
  "evaluationError": null
}
```

---

## 环境变量与配置建议

| 变量名 | 说明 |
|--------|------|
| `ASR_PROVIDER` | 讯飞 / 腾讯云 / 阿里云 |
| `ASR_APP_ID` | ASR 应用 ID |
| `ASR_API_KEY` | ASR API Key |
| `ASR_API_SECRET` | ASR API Secret（讯飞等） |
| `PRON_API_URL` | 口语评测 API 地址 |
| `PRON_API_KEY` | 口语评测 API Key |
| `LLM_API_URL` | 语义兜底 LLM 地址（可选） |
| `LLM_API_KEY` | LLM API Key |

---

## 配置落地（云开发控制台）

在 **云开发 → 云函数 → ai_evaluateSubmission → 配置** 中设置环境变量：

- `ASR_APP_ID`、`ASR_API_KEY`、`ASR_API_SECRET`：接入真实 ASR 时填写
- `PRON_API_URL`、`PRON_API_KEY`：接入口语评测时填写

未配置时使用 Mock 逻辑，可正常联调。

---

## 实施状态

- [x] 1. 数据模型扩展（docs/database_setup.md 已更新）
- [x] 2. task_items 判分配置 + teacher_addDayTasks + addTask 透传
- [x] 3. student_markProgress 提交后异步触发 ai_evaluateSubmission
- [x] 4. ai_evaluateSubmission 云函数（**讯飞 suntone 发音评测** + 语义规则 + Mock 兜底）
- [x] 5. student_getMySubmissions 返回评测字段
- [x] 6. 学生端 taskDetail 展示评测结果 + 轮询
- [x] 7. 学生端 submission 展示评测状态与总分
- [x] 8. 教师 review 接入 AI 评测字段

### 4b. suntone 集成说明

- **引擎**：讯飞语音评测 suntone（WebSocket）
- **接口**：中英文 `wss://cn-east-1.ws-api.xf-yun.com/v1/private/s8e098720`
- **环境变量**（云开发控制台 → ai_evaluateSubmission → 配置）：
  - `ASR_APP_ID`、`ASR_API_KEY`、`ASR_API_SECRET`
- 未配置或 suntone 调用失败时自动回退到 Mock 发音分
