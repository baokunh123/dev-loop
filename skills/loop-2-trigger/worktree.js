function slugifyTicket(ticket) {
  return ticket.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function buildWorktreeLabel({ ticket, suffix }) {
  return `${slugifyTicket(ticket)}-${suffix}`
}

export function buildWorktreePath({ ticket, suffix }) {
  return `/Users/bhuang/workspace/mortgage-wt-${buildWorktreeLabel({ ticket, suffix })}`
}

export function buildBranchName({ ticket, suffix }) {
  return `codex/${buildWorktreeLabel({ ticket, suffix })}`
}
