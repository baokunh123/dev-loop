import fs from 'fs'
import path from 'path'
import cron from 'node-cron'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const processedFile = path.join(__dirname, 'processed.json')
const clarifiedDir = path.join(__dirname, 'clarified')

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function loadProcessed() {
  try {
    return JSON.parse(fs.readFileSync(processedFile, 'utf8'))
  } catch {
    return {}
  }
}

function saveProcessed(state) {
  fs.writeFileSync(processedFile, `${JSON.stringify(state, null, 2)}\n`)
}

function isProcessed(key) {
  return Boolean(loadProcessed()[key])
}

function markProcessed(key) {
  const state = loadProcessed()
  state[key] = new Date().toISOString()
  saveProcessed(state)
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

function writeTicket(issue) {
  const filePath = path.join(clarifiedDir, `${issue.key}.md`)
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

  fs.writeFileSync(filePath, content)
  log(`Written: ${filePath}`)
}

async function fetchTickets() {
  if (!process.env.JIRA_BASE || !process.env.JIRA_EMAIL || !process.env.JIRA_TOKEN) {
    throw new Error('Missing JIRA_BASE, JIRA_EMAIL, or JIRA_TOKEN')
  }

  const jql = 'assignee = currentUser() AND status = "In Progress" AND labels = "claude-ready"'
  const url = `${process.env.JIRA_BASE}/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=renderedFields&fields=summary,description,comment,updated`
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

async function poll() {
  log('Poll start')

  let issues
  try {
    issues = await fetchTickets()
  } catch (error) {
    log(`Jira API error: ${error.message}`)
    log('Poll end (error)')
    return
  }

  log(`Tickets found: ${issues.length}`)

  for (const issue of issues) {
    const dedupeKey = `${issue.key}-${issue.fields.updated ?? 'missing-updated'}`
    if (isProcessed(dedupeKey)) {
      log(`Skipped (dedup): ${issue.key}`)
      continue
    }

    writeTicket(issue)
    markProcessed(dedupeKey)
  }

  log('Poll end')
}

cron.schedule('0 9-17 * * 1-5', poll, { timezone: 'America/Los_Angeles' })
log('server.js started - polling weekdays 9-17 PST')
poll()
