import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchTickets, poll } from '../server.js'

function makeIssue() {
  return {
    key: 'FPP-2245',
    fields: {
      summary: 'Test issue',
      updated: '2026-07-21T10:00:00.000Z',
      description: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Test description' }]
          }
        ]
      },
      comment: {
        comments: [
          {
            author: { displayName: 'Tester' },
            created: '2026-07-21T10:01:00.000Z',
            body: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Test comment' }]
                }
              ]
            }
          }
        ]
      }
    }
  }
}

test('dry run logs writes but does not write files or update processed state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-test-'))
  const clarifiedDir = path.join(root, 'clarified')
  const processedFile = path.join(root, 'processed.json')

  fs.mkdirSync(clarifiedDir)
  fs.writeFileSync(processedFile, '{}\n')

  const logs = []

  await poll({
    dryRun: true,
    clarifiedDir,
    processedFile,
    fetchTicketsImpl: async () => [makeIssue()],
    logger: (message) => logs.push(message),
    auditImpl: () => {}
  })

  assert.deepEqual(fs.readdirSync(clarifiedDir), [])
  assert.equal(fs.readFileSync(processedFile, 'utf8'), '{}\n')
  assert.ok(logs.some((message) => message.includes('Dry run: would write FPP-2245')))
})

test('normal poll writes files and updates processed state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-test-'))
  const clarifiedDir = path.join(root, 'clarified')
  const processedFile = path.join(root, 'processed.json')

  fs.mkdirSync(clarifiedDir)
  fs.writeFileSync(processedFile, '{}\n')

  await poll({
    clarifiedDir,
    processedFile,
    fetchTicketsImpl: async () => [makeIssue()],
    logger: () => {},
    auditImpl: () => {}
  })

  assert.ok(fs.existsSync(path.join(clarifiedDir, 'FPP-2245.md')))
  assert.match(fs.readFileSync(processedFile, 'utf8'), /FPP-2245-2026-07-21T10:00:00.000Z/)
})

test('fetchTickets uses the enhanced Jira search endpoint', async () => {
  process.env.JIRA_BASE = 'https://bettermortgage.atlassian.net'
  process.env.JIRA_EMAIL = 'bhuang@better.com'
  process.env.JIRA_TOKEN = 'test-token'

  let requestedUrl
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    requestedUrl = String(url)
    return {
      ok: true,
      async json() {
        return { issues: [] }
      }
    }
  }

  try {
    await fetchTickets()
  } finally {
    global.fetch = originalFetch
  }

  assert.ok(requestedUrl.includes('/rest/api/3/search/jql?'))
  assert.ok(requestedUrl.includes('fields=summary%2Cdescription%2Ccomment%2Cupdated'))
})
