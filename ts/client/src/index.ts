export interface GatewayOptions { baseUrl: string; timeoutMs?: number }

export class GatewayClient {
  private baseUrl: string
  private timeout: number
  constructor(opts: GatewayOptions) {
    this.baseUrl = opts.baseUrl
    this.timeout = opts.timeoutMs ?? 60000
  }
  async callTool(server: string, tool: string, args: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/call_tool`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server, tool, arguments: args })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error)
    return json.result
  }
}
