# 海南口语训练平台 - 开发路线图与 Todo

> 综合需求、最低成本后端、分阶段实现

---

## 架构总览

```
小程序
  ├─ 云函数（微信云开发）─────────────── 讯飞 API（国内直连）
  │     └─ ai_evaluateSubmission
  │           ├─ 讯飞 ISE：ASR + 发音评测 ✅ 可直连
  │           └─ （可选）调用自建后端
  │
  └─ HTTPS/WSS ───────────────────────── 自建后端（海外/香港）
          └─ OpenAI：Chat（语义判分）、Realtime（语音辅导）
```

**关键点**：讯飞在国内，云函数可直接调；OpenAI 需通过自建后端代理。

---

## 最低成本后端方案

| 阶段 | 后端需求 | 推荐方案 | 月成本 |
|------|----------|----------|--------|
| Phase 1 | 仅需代理 OpenAI Chat API（HTTP） | Vercel/Railway 免费层 或 单函数 | **¥0** |
| Phase 2 | 需 WebSocket 长连（Realtime） | 单机 VPS（香港/新加坡） | **¥20–40** |

**Phase 1 最低成本**：用 Vercel Serverless 或 Railway 免费额度，部署一个 `POST /api/evaluate-semantic` 代理到 OpenAI，云函数 `ai_evaluateSubmission` 在需要 LLM 时调用该接口。

**Phase 2**：当要做 Realtime 语音辅导时，再上一台 1 核 1G 的 VPS（如 Vultr/DigitalOcean 香港），跑 Node 转发 WebSocket。

---

## Todo 列表

### 一、Phase 1：真实评测链路（无 OpenAI 也可跑通）

| # | 任务 | 说明 | 依赖 |
|---|------|------|------|
| P1-1 | 注册讯飞开放平台，创建 ISE 应用 | 个人实名，领取 1 万次/年免费 | 无 |
| P1-2 | 云函数接入讯飞 ISE | 替换 `mockAsr` 和 `mockPronScore`，调用讯飞 WebSocket/HTTP API | P1-1 |
| P1-3 | 云函数环境变量配置 | ASR_APP_ID、ASR_API_KEY、ASR_API_SECRET | P1-1 |
| P1-4 | 语义判分保持规则优先 | 继续用现有 `scoreSemantic`，讯飞 ISE 自带 ASR 文本 | P1-2 |
| P1-5 | 联调测试 | 真机录音→上传→评测→结果展示 | P1-2 |

**Phase 1 完成后**：无额外成本，评测链路可上线。

---

### 二、Phase 1b：LLM 语义兜底（需自建后端）

| # | 任务 | 说明 | 依赖 |
|---|------|------|------|
| P1b-1 | 搭建最小 HTTP 代理服务 | 部署到 Vercel/Railway，暴露 `POST /api/chat` | 无 |
| P1b-2 | 实现 semantic-by-llm 接口 | 入参：题目、ASR 文本、标准答案；调用 OpenAI Chat，返回 JSON（is_correct, score, feedback） | P1b-1 |
| P1b-3 | 云函数调用自建后端 | `ai_evaluateSubmission` 在规则不确定时调用该接口 | P1b-2, P1-2 |
| P1b-4 | 小程序配置合法域名 | 将后端 `https://xxx.vercel.app` 加入 request 合法域名 | P1b-1 |

**成本**：Vercel/Railway 免费层通常够用。

---

### 三、Phase 2：Realtime 语音辅导（创新点）

| # | 任务 | 说明 | 依赖 |
|---|------|------|------|
| P2-1 | 购买/租用 VPS | 1 核 1G，香港或新加坡，支持 WebSocket | 无 |
| P2-2 | 部署 Node 转发服务 | 接收小程序 WSS，转发到 OpenAI Realtime | P2-1 |
| P2-3 | 设计 Realtime 会话流程 | 初始化时注入：场景、学生水平、最新评测结果 | P2-2 |
| P2-4 | 小程序端 WSS 连接 | 录音推流 ↔ 接收语音播放，配置 `wss://` 合法域名 | P2-2 |
| P2-5 | 与评测结果打通 | 评测完成后可跳转「AI 教练」，把分数/错词传入 Realtime | P2-3, P1-5 |

**成本**：约 ¥20–40/月。

---

### 四、基础设施与配置

| # | 任务 | 说明 |
|---|------|------|
| I-1 | 域名（可选） | 用 Vercel/Railway 自带域名可省；正式环境建议自有域名 + HTTPS |
| I-2 | 小程序 request/wss 合法域名 | 开发阶段可勾选「不校验合法域名」 |
| I-3 | 密钥管理 | OpenAI API Key、讯飞 Key 仅存服务端，不写入小程序 |

---

## 建议执行顺序

### 立即可做（本周）

1. **P1-1**：注册讯飞，创建 ISE 应用  
2. **P1-2** + **P1-3**：在 `ai_evaluateSubmission` 接入讯飞，配置环境变量  
3. **P1-5**：真机联调，验证评测全流程  

### 短期（1–2 周）

4. **P1b-1** + **P1b-2**：部署最小 OpenAI 代理（Vercel/Railway）  
5. **P1b-3**：云函数在规则不确定时调用 LLM  
6. **P1b-4**：配置小程序合法域名  

### 中期（创新点）

7. **P2-1** ~ **P2-5**：在确认 Phase 1 稳定后，再启动 Realtime 与 VPS  

---

## 接下去做什么（具体动作）

### 第一步：讯飞接入（优先）

1. 打开 [讯飞开放平台](https://www.xfyun.cn/) → 登录/注册 → 实名认证  
2. 控制台 → 语音评测 (ISE) → 创建应用 → 拿到 APPID、APIKey、APISecret  
3. 在项目中实现讯飞 ISE 调用逻辑（替换 `ai_evaluateSubmission` 中的 Mock）  
4. 云开发控制台 → `ai_evaluateSubmission` → 配置 → 环境变量，填入上述三个值  
5. 部署云函数，用真机录音做一次完整评测  

### 第二步：决定是否要 LLM 兜底

- 若当前规则判分已经够用，可先不做 P1b，直接优化讯飞评测体验  
- 若希望有「答非所问」「部分正确」等更细判定，再按 P1b 顺序做  

### 第三步：Realtime 创新点

- 等 Phase 1 稳定、用户有真实使用后，再投入 P2  
- 届时再选具体 VPS 与 Node 技术栈（例如 Express + ws）  

---

## 文件变更预期

| 阶段 | 修改/新增文件 |
|------|---------------|
| P1-2 | `cloudfunctions/ai_evaluateSubmission/index.js`（讯飞接入） |
| P1b-1 | 新建 `backend/` 或独立 repo，如 `api/chat.js`（Vercel function） |
| P1b-3 | `cloudfunctions/ai_evaluateSubmission/index.js`（调用 LLM 接口） |
| P2-2 | `backend/realtime-proxy.js` 或类似 |
| P2-4 | `pages/student/xxx/` 新增「AI 教练」页面 |

---

## 风险与备选

- **讯飞免费额度用尽**：可暂时切回 Mock，或评估腾讯云智聆  
- **自建后端被墙**：VPS 选香港/新加坡，保证能访问 OpenAI  
- **Realtime 成本**：按使用量计费，可先用小流量验证效果  
