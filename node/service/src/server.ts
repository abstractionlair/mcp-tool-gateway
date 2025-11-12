import express from 'express'

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, servers: [] })
})

app.get('/tools', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' })
})

app.get('/logs', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' })
})

app.post('/call_tool', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' })
})

const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`mcp-tool-gateway listening on :${port}`)
})
