import fs from 'node:fs'
import path from 'node:path'

function loadDotEnvFile(filePath: string) {
  if (!filePath) return
  try {
    if (!fs.existsSync(filePath)) return
    const text = fs.readFileSync(filePath, 'utf-8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const key = match[1]
      let value = match[2]
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  } catch {
    // ignore parse/load errors silently
  }
}

// Attempt to load .env from common locations (current, parent, repo root)
const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(process.cwd(), '..', '..', '.env'),
]
for (const p of candidates) loadDotEnvFile(p)

export {} // side-effect module

