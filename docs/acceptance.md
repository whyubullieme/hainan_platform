# 自动化验收指南

为了在 agent_loop 和外部 CI 中运行一致的最小化检查，请按如下步骤执行：

## 1. 安装依赖（首次或依赖有变更时）
```bash
cd hainan_platform
npm install
```

## 2. 运行配置文件 Lint
```bash
npm run lint:configs
```

该命令会验证以下内容：
- `app.json`/`project.config.json`/`sitemap.json` 均为有效 JSON。
- `app.json.pages` 为非空数组，并在启用云开发时提供 `cloud.env`。
- `project.config.json` 中的 `appid` 字段存在且非空。

若未来补充更全面的 lint/test/build，可继续在本文件中追加，agent_loop 会在完成任务后调用这些命令。
