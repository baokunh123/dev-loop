---
name: loop-1-triage
description: Jira fetch + 扫描 clarified/ 中未处理的 ticket + 运行 brainstorming 产出计划
user_invocable: false
---

# Loop 1 Skill

你是 Loop 1 agent。本 skill 通过 CronCreate 调度（`0 9-17 * * 1-5` PST）运行。

**前置条件：** 本 skill 必须在 `~/workspace/mortgage-graphify` 目录的 Claude Code session 中运行，以获取项目 CLAUDE.md 和编码规范的 context。

## 步骤 1：运行 bash 脚本

```bash
bash ~/.claude/skills/loop-1-triage/loop-1.sh
```

脚本会：
1. 获取全局 poll.lock（防多 session 并发）
2. 调用 Jira API，写 `clarified/<TICKET>.md` + 更新 `processed.json`
3. 释放 poll.lock
4. 选取下一个无 `plan.md` 的 ticket，获取 per-ticket lock

- 输出为空 → 无待处理 ticket，静默退出。
- 输出 `TICKET=FPP-1234` 和 `CONTENT_FILE=...` → 继续下一步。

## 步骤 2：读取 ticket 内容

读取 `CONTENT_FILE` 的完整内容。

## 步骤 3：运行 brainstorming

调用 `superpowers:brainstorming`，注入以下初始 context：

> "这是 mortgage-graphify monorepo 的一个 Jira ticket。Ticket 内容：[完整 ticket 内容]"

brainstorming 是交互式的——skill 启动后由用户接管对话，回答问题，直到需求澄清完毕。

## 步骤 4：保存 spec

brainstorming 完成后，将 spec 保存到：
- `~/workspace/dev-loop/clarified/<ticket>/spec.md`（英文）
- `~/workspace/dev-loop/clarified/<ticket>/spec.zh.md`（中文）

## 步骤 5：运行 writing-plans

调用 `superpowers:writing-plans`，基于 spec 编写实施计划，保存到：
- `~/workspace/dev-loop/clarified/<ticket>/plan.md`（英文）
- `~/workspace/dev-loop/clarified/<ticket>/plan.zh.md`（中文）

## 步骤 6：释放 lockfile

```bash
rm ~/workspace/dev-loop/clarified/<ticket>.lock
```

## 步骤 7：等待用户审阅

展示 `plan.zh.md` 的内容，询问用户是否批准：

> "以上是 <ticket> 的实施计划。是否批准？(yes/no)"

- 用户回答 **yes** → 继续步骤 8
- 用户回答 **no** → 告知用户可手动修改 `clarified/<ticket>/plan.md` 后重新触发，结束。

## 步骤 8：移入 ready/

```bash
cp -r ~/workspace/dev-loop/clarified/<ticket> ~/workspace/dev-loop/ready/<ticket>
```

ticket 已进入 Loop 2 队列。
