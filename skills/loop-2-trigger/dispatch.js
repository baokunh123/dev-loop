import path from 'path'

export function buildWorkerPrompt({ ticket, planPath, resultPath }) {
  return `Read ${planPath}.

You are working on /Users/bhuang/workspace/mortgage from this thread.

Required execution flow:
- Use superpowers:using-superpowers first.
- Then read the implementation plan.
- Use mortgage-new-worktree to create a fresh mortgage worktree from origin/master for this ticket.
- Do all implementation, verification, and branch work in that new mortgage worktree, not in /Users/bhuang/workspace/mortgage.
- Use superpowers:subagent-driven-development to execute the plan task by task.
- Before any completion claim, use superpowers:verification-before-completion.
- Then use superpowers:finishing-a-development-branch.

When finished, write this file:
- ${resultPath}

Write exactly one of:
- {"status":"success","pr_url":"<url>"}
- {"status":"failed","reason":"<reason>"}

Do not update any other ticket state files directly unless required by the plan.`
}

export function buildDispatchPayload({ ticket, baseDir }) {
  const readyPath = path.join(baseDir, 'ready', ticket)
  const planPath = path.join(readyPath, 'plan.md')
  const resultPath = path.join(readyPath, 'result.json')

  return {
    ticket,
    plan_path: planPath,
    ready_path: readyPath,
    result_path: resultPath,
    worker_prompt: buildWorkerPrompt({ ticket, planPath, resultPath })
  }
}
