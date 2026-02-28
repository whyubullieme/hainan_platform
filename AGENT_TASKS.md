# AGENT_TASKS

## 项目目标
- 跑通 LMS 小程序核心流程（学生登录、入班、查看任务、签到/提交，老师概览/点评）。
- 搭建教师端云函数（CF5–CF7）与前端交互，完成点评闭环。
- 为次日早晨的飞书日报准备所需统计接口，后续自动推送。

## 待办列表
- [x] P1：实现 CF5 `teacher_getOverview`（云函数 + 最小测试）。
- [x] P2：实现 CF6 `teacher_listStudentsByStatus`。
- [x] P3：实现 CF7 `teacher_saveReview`（含 reviews 集合）。

## 验收命令
详见 `docs/acceptance.md`，当前要求：
```bash
npm run lint:configs && npm run test:agent-loop
# 加上本次任务对应的 CF smoke test
```

## 阻断说明
- 暂无，待实际执行中记录。
