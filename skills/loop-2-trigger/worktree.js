export function buildWorktreePath({ ticket, runId }) {
  return `/Users/bhuang/workspace/mortgage-wt-${ticket.toLowerCase()}-${runId}`
}

export function buildBranchName({ ticket, runId }) {
  return `${ticket.toLowerCase()}-${runId}`
}
