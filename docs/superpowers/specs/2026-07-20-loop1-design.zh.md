# Loop 1 设计 — Jira → 需求澄清 → 计划

## 概述

Loop 1 自动化从 Jira ticket 到可实施计划的全过程。包含两个组件：轮询服务器（`dev-loop/server.js`）负责将 ticket 拉取到本地，Claude Code skill（`loop-1-triage`）负责运行 brainstorming 并输出计划。

人工审批环节是显式的：你将完成的计划从 `clarified/` 移到 `ready/` 即为批准，交给 Loop 2 执行。

## 架构

```
Jira（claude-ready 标签，assignee = 我，status = In Progress）
    ↓  每 60 分钟轮询，工作日 9-5 PST
server.js（~/workspace/dev-loop）
    ↓  写入 ticket 内容
clarified/FPP-1234.md
    ↓  CronCreate 每 60 分钟触发，工作日 9-5 PST
loop-1-triage skill
    ↓  触发 superpowers:brainstorming → superpowers:writing-plans
clarified/FPP-1234/plan.md
    ↓  你手动移动
ready/FPP-1234/            ← Loop 2 输入（超出本范围）
```

## 组件

### 1. `server.js`（dev-loop repo）

**职责：** 轮询 Jira，将 ticket 内容写到本地磁盘。仅此而已。

**调度：** `node-cron` 表达式 `0 9-17 * * 1-5`（本地 PST 时区），每小时整点触发，仅工作日。

**Jira 查询：**
```
assignee = currentUser() AND status = "In Progress" AND labels = "claude-ready"
```

**去重：** `processed.json`，key 为 `${ticket.key}-${ticket.fields.updated}`。同一 ticket 且 `updated` 时间戳未变 → 跳过。ticket 有更新（如新增 comment、重新加标签）→ 重新处理。

**输出：** `clarified/FPP-1234.md`，包含：
- Ticket key、标题、描述
- 所有 comment（按时间顺序）
- 拉取时间戳

**日志：** 所有操作记录到 stdout（带时间戳）：
- 轮询开始/结束
- 发现的 ticket 数量
- 每个 ticket：已写入 / 已跳过（去重）
- Jira API 错误（记录并继续，不崩溃进程）

### 2. `loop-1-triage` skill（mortgage-graphify/.claude/skills/）

**触发：** CronCreate，`0 9-17 * * 1-5` PST，在 Claude Code session 启动时手动注册。

**职责：**
1. 扫描 `~/workspace/dev-loop/clarified/` 下没有对应 `<ticket>/plan.md` 的 `.md` 文件
2. 选取一个（ticket 编号最小的优先）
3. 读取 ticket 内容
4. 携带 ticket 上下文触发 `superpowers:brainstorming`
5. 完成后，`superpowers:writing-plans` 将计划写入 `clarified/FPP-1234/plan.md`（英文 + 中文各一份）
6. 无待处理 ticket → 静默退出

**每次只处理一个：** 每次 cron 触发只处理一个 ticket，避免 session 被多个 brainstorming 淹没。

**跨 session 去重：** 多个 Claude Code session 可能同时扫描 `clarified/`，用 lockfile 防止重复处理：
1. 处理前检查是否存在 `FPP-1234.lock`
2. 不存在 → 写入 `FPP-1234.lock`（内容：session ID + 时间戳）
3. 处理完成 → 删除 `.lock`
4. `.lock` 存在且时间戳 < 2 小时 → 跳过
5. `.lock` 存在且时间戳 > 2 小时 → 视为过期，覆盖并继续处理

**session 中断：** Claude Code 在 brainstorming 过程中被关闭时，`.lock` 文件可能残留。2 小时过期机制会自动处理这种情况。CronCreate 在 session 启动时手动注册。

### 3. 文件结构（dev-loop repo）

```
~/workspace/dev-loop/
├── server.js
├── processed.json        # 去重状态
├── .env                  # JIRA_TOKEN, JIRA_EMAIL, JIRA_BASE
├── clarified/
│   ├── FPP-1234.md       # 原始 ticket，由 server.js 写入
│   ├── FPP-1234/
│   │   ├── plan.md       # 英文计划，由 brainstorming 写入
│   │   └── plan.zh.md    # 中文计划，由 brainstorming 写入
│   ├── FPP-1235.md
│   └── ...
└── ready/                # Loop 2 输入 — 你移动文件到此处即为批准
```

## 人工审批门

将 `clarified/FPP-1234/` 移动到 `ready/FPP-1234/` 即为批准操作。Loop 2 监听 `ready/`。此步骤为有意设计的手动操作，超出 Loop 1 范围。

## 语言规范

所有 spec 和 plan 同时输出英文和中文两份，文件命名：
- `plan.md`（英文）
- `plan.zh.md`（中文）

## 超出范围

- Loop 2（Codex 实现）
- Jira comment 写入 / 状态更新
- 自动批准
- session 启动时自动注册 CronCreate（当前为手动）
