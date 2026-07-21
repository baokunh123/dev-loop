import fs from 'fs'
import path from 'path'
import cron from 'node-cron'
import process from 'node:process'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultProcessedFile = path.join(__dirname, 'processed.json')
const defaultClarifiedDir = path.join(__dirname, 'clarified')

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function loadProcessed(processedFile = defaultProcessedFile) {
  try {
    return JSON.parse(fs.readFileSync(processedFile, 'utf8'))
  } catch {
    return {}
  }
}

function saveProcessed(state) {
  fs.writeFileSync(defaultProcessedFile, `${JSON.stringify(state, null, 2)}\n`)
}

function saveProcessedToFile(processedFile, state) {
  fs.writeFileSync(processedFile, `${JSON.stringify(state, null, 2)}\n`)
}

function isProcessed(processedFile, key) {
  return Boolean(loadProcessed(processedFile)[key])
}

function markProcessed(processedFile, key) {
  const state = loadProcessed(processedFile)
  state[key] = new Date().toISOString()
  saveProcessedToFile(processedFile, state)
}

function extractText(node) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node !== 'object') return String(node)

  const text = typeof node.text === 'string' ? node.text : ''
  const content = Array.isArray(node.content) ? node.content.map(extractText).join('') : ''

  if (node.type === 'paragraph') return `${text}${content}\n\n`
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'listItem') return `- ${content}`.trimEnd()

  return `${text}${content}`
}

function renderField(value, fallback) {
  const text = extractText(value).trim()
  if (text) return text
  if (value && typeof value === 'object') return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
  return fallback
}

function buildTicketContent(issue) {
  const comments = (issue.fields.comment?.comments ?? [])
    .map((comment) => {
      const author = comment.author?.displayName ?? 'Unknown'
      const created = comment.created ?? 'Unknown time'
      return `**${author}** (${created}):\n${renderField(comment.body, '_No comment body_')}`
    })
    .join('\n\n---\n\n')

  const content = `# ${issue.key}: ${issue.fields.summary ?? 'Untitled ticket'}

**Fetched:** ${new Date().toISOString()}

## Description

${renderField(issue.fields.description, '_No description_')}

## Comments

${comments || '_No comments_'}
`
  return content
}

function writeTicket(clarifiedDir, issue, logger = log) {
  const filePath = path.join(clarifiedDir, `${issue.key}.md`)
  const content = buildTicketContent(issue)
  fs.writeFileSync(filePath, content)
  logger(`Written: ${filePath}`)
}

export async function fetchTickets() {
  if (!process.env.JIRA_BASE || !process.env.JIRA_EMAIL || !process.env.JIRA_TOKEN) {
    throw new Error('Missing JIRA_BASE, JIRA_EMAIL, or JIRA_TOKEN')
  }

  const jql = 'assignee = currentUser() AND status = "Doing" AND labels = "claude-ready"'
  const url = `${process.env.JIRA_BASE}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent('summary,description,comment,updated')}`
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`).toString('base64')
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`
    }
  })

  if (!response.ok) {
    throw new Error(`Jira API ${response.status}: ${await response.text()}`)
  }

  const payload = await response.json()
  return payload.issues ?? []
}

export async function poll({
  dryRun = false,
  processedFile = defaultProcessedFile,
  clarifiedDir = defaultClarifiedDir,
  fetchTicketsImpl = fetchTickets,
  logger = log
} = {}) {
  logger(`Poll start${dryRun ? ' (dry run)' : ''}`)

  let issues
  try {
    issues = await fetchTicketsImpl()
  } catch (error) {
    logger(`Jira API error: ${error.message}`)
    logger('Poll end (error)')
    return
  }

  logger(`Tickets found: ${issues.length}`)

  for (const issue of issues) {
    const dedupeKey = `${issue.key}-${issue.fields.updated ?? 'missing-updated'}`
    if (isProcessed(processedFile, dedupeKey)) {
      logger(`Skipped (dedup): ${issue.key}`)
      continue
    }

    if (dryRun) {
      logger(`Dry run: would write ${issue.key}`)
      continue
    }

    writeTicket(clarifiedDir, issue, logger)
    markProcessed(processedFile, dedupeKey)
  }

  logger('Poll end')
}

function startScheduler() {
  cron.schedule('0 9-17 * * 1-5', () => poll(), { timezone: 'America/Los_Angeles' })
  log('server.js started - polling weekdays 9-17 PST')
  poll()
}

export async function main(argv = process.argv.slice(2)) {
  const once = argv.includes('--once')
  const dryRun = argv.includes('--dry-run')

  if (once || dryRun) {
    await poll({ dryRun })
    return
  }

  startScheduler()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
