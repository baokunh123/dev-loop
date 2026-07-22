# Loop 2 设计 — Plan → Codex → PR

## 概述

Loop 2 从 `ready/` 中 pick up 已批准的 plan，以 full-auto 模式运行 Codex 完成实现、验证并开 PR。整个过程无需人工介入，直到 PR 创建成功（成功）或两次尝试均失败后 escalate 到 `failed/`。

## 架构

```
ready/<ticket>/plan.md     ← 人工批准，从 clarified/ 移来
    ↓  loop2-server.js，每 60 分钟 poll，工作日 9-5 PST
    ↓  每个 ticket spawn loop-2-trigger.sh <ticket>（并行）
    ↓  bash：lockfile 检查 → 写 lockfile
codex exec "..."
    ↓  superpowers:subagent-driven-development
    ↓  superpowers:verification-before-completion
    ↓  superpowers:finishing-a-development-branch → PR 开出
    ↓  写 result.json：{status, pr_url} 或 {status, reason}
    ↓  成功 → mv ready/<ticket>/ done/<ticket>/
    ↓  失败 → retry 一次（同样的 codex 命令）
    ↓  retry 失败 → 写 failed/<ticket>/error.md，mv ready/<ticket>/ failed/<ticket>/
```

## 组件

### 1. `loop2-server.js`

**职责：** poll `ready/`，每发现一个 ticket spawn 一个 `loop-2-trigger.sh`。仅此而已。

**调度：** `node-cron` `0 9-17 * * 1-5`，`America/Los_Angeles` 时区。

**发现逻辑：** 扫描 `ready/` 下包含 `plan.md` 的子目录，每个都是待处理 ticket。

**Spawn：** `spawn('bash', ['~/.claude/skills/loop-2-trigger/loop-2-trigger.sh', ticket])`，detached，非阻塞。多个 ticket 并行跑。

**日志：** 所有操作记录到 stdout（带 ISO 时间戳）：
- poll 开始/结束
- 发现的 ticket 数量
- 每个 ticket：已 spawn / 已跳过（lockfile 活跃）
- spawn 错误

### 2. `loop-2-trigger.sh <ticket>`

**位置：** `~/.claude/skills/loop-2-trigger/loop-2-trigger.sh`

**职责：** 获取 lockfile → 运行 Codex → 读取 result → 移动 ticket 到 `done/` 或 `failed/` → 释放 lockfile。

**Lockfile：** `ready/<ticket>.lock`，格式和 2 小时过期阈值与 Loop 1 相同。

**Codex prompt：**
```
Read ~/workspace/dev-loop/ready/<ticket>/plan.md.
Use superpowers:subagent-driven-development to implement all tasks.
When complete, run superpowers:verification-before-completion.
Then run superpowers:finishing-a-development-branch.
Work in ~/workspace/mortgage-graphify.
When done, write ~/workspace/dev-loop/ready/<ticket>/result.json:
- On success: {"status": "success", "pr_url": "<url>"}
- On failure: {"status": "failed", "reason": "<reason>"}
```

**结果处理：**
- Codex 退出后读取 `ready/<ticket>/result.json`
- `status: success` → `mv ready/<ticket>/ done/<ticket>/`，删 lockfile
- `status: failed` 或文件不存在 → retry 一次（重跑同样的 Codex 命令）
- retry `status: success` → `mv ready/<ticket>/ done/<ticket>/`，删 lockfile
- retry `status: failed` 或文件不存在 → 写 `failed/<ticket>/error.md`，`mv ready/<ticket>/ failed/<ticket>/`，删 lockfile

**`failed/<ticket>/error.md` 格式：**
```
# <ticket> — 两次尝试均失败

Attempt 1: <原因 或 "result.json 不存在">
Attempt 2: <原因 或 "result.json 不存在">
时间戳: <ISO>
```

### 3. 文件夹结构（dev-loop repo）

```
~/workspace/dev-loop/
├── loop2-server.js
├── ready/
│   └── FPP-1234/
│       ├── plan.md
│       ├── plan.zh.md
│       ├── spec.md
│       ├── spec.zh.md
│       └── result.json       ← Codex 写入
├── done/
│   └── FPP-1234/             ← 成功后移到这里
└── failed/
    └── FPP-1234/
        ├── ...               ← 原始文件保留
        └── error.md          ← 失败摘要
```

### 4. Codex skill（`loop-2-trigger`）

**位置：** `~/.claude/skills/loop-2-trigger/SKILL.md`

仅作参考文档——Loop 2 由 bash 触发，不是 Claude Code CronCreate。skill 记录 Codex prompt 和预期行为，便于维护。

## 人工介入点

- **成功：** PR 开出，你正常 review 和 merge。
- **失败：** ticket 出现在 `failed/` 里，你查看 `error.md`，修复 plan 或 ticket，移回 `ready/` 重试。

## 超出范围

- Jira 状态更新
- Slack/邮件通知
- CI 监控（PR 开出后 CI 结果在 GitHub 上看）
- Loop 1（见 loop1-design.md）
