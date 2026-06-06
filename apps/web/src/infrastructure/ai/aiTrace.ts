// AI Trace — observer interface and built-in implementations.
//
// To add a new observer (e.g. for multi-agent routing, UI panel, test recording):
//   1. Implement AITraceObserver
//   2. Pass it to AgentRunner (or wrap with CompositeTraceObserver)
//
// agentId in each event is optional now; fill it in when you introduce named sub-agents.

import type { APIMessage } from '../../ports'

// ── Event types ───────────────────────────────────────────────────────────────

export interface RequestParams {
  model?:      string
  toolCount:   number
  temperature?: number
}

export type AITraceEvent =
  | { kind: 'request';       agentId?: string; round: number; messages: APIMessage[]; params?: RequestParams }
  | { kind: 'tool_call';     agentId?: string; round: number; toolName: string; args: unknown }
  | { kind: 'tool_result';   agentId?: string; round: number; toolName: string; result: string }
  | { kind: 'response';      agentId?: string; text: string }
  | { kind: 'error';         agentId?: string; error: unknown }
  | { kind: 'tier_decision'; agentId?: string; tier: 'guide' | 'simple_write' | 'wizard'; intent: string; params?: Record<string, unknown> }

// ── Observer interface ────────────────────────────────────────────────────────

export interface AITraceObserver {
  onEvent(event: AITraceEvent): void
}

// ── ConsoleTraceObserver ──────────────────────────────────────────────────────

export class ConsoleTraceObserver implements AITraceObserver {
  private prefix(e: AITraceEvent) {
    return e.agentId ? `[AI Trace / ${e.agentId}]` : '[AI Trace]'
  }

  // e.messages には system・user・assistant・tool の全メッセージが蓄積されるため、
  // 最後の round の行を右クリック → "Copy Object" で全履歴＋全ツール結果を一括取得できる。
  onEvent(e: AITraceEvent): void {
    const p = this.prefix(e)
    switch (e.kind) {
      case 'request':
        console.log(`${p} round ${e.round} → request`, e.messages)
        break

      case 'tool_call':
        console.log(`${p} round ${e.round} → tool_call: ${e.toolName}`, e.args)
        break

      case 'tool_result': {
        let parsed: unknown = e.result
        try { parsed = JSON.parse(e.result) } catch { /* keep as string */ }
        console.log(`${p} round ${e.round} ← tool_result: ${e.toolName}`, parsed)
        break
      }

      case 'response':
        console.log(`${p} response:`, e.text)
        break

      case 'error':
        console.error(`${p} error:`, e.error)
        break
    }
  }
}

// ── SummaryTraceObserver ──────────────────────────────────────────────────────
// Accumulates a compact human-readable log across all turns in a session.
// Designed to be pasted into a chat for debugging — one turn ≈ 5–10 lines.

interface CallEntry {
  tool:    string
  args:    string
  result?: string
}

interface TurnEntry {
  user:    string
  calls:   CallEntry[]
  response: string
}

export class SummaryTraceObserver implements AITraceObserver {
  private turns:       TurnEntry[] = []
  private current:     TurnEntry | null = null
  private pendingCall: CallEntry | null = null

  private truncate(s: string, max = 120): string {
    return s.length <= max ? s : s.slice(0, max) + '…'
  }

  private fmtArgs(args: unknown): string {
    if (!args || typeof args !== 'object') return String(args)
    return '{' + Object.entries(args as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${(v as unknown[]).join(', ')}]` : JSON.stringify(v)}`)
      .join(', ') + '}'
  }

  private fmtResult(result: string): string {
    try {
      const obj = JSON.parse(result)
      if (Array.isArray(obj)) {
        const sample = obj.length > 0 ? ' ' + this.truncate(JSON.stringify(obj[0]), 80) : ''
        return `[${obj.length}件${sample}]`
      }
      return this.truncate(JSON.stringify(obj))
    } catch {
      return this.truncate(result)
    }
  }

  onEvent(e: AITraceEvent): void {
    switch (e.kind) {
      case 'request':
        if (e.round === 0) {
          // Push any incomplete turn before starting a new one (e.g. after an API error)
          if (this.current) this.turns.push(this.current)
          const userMsg = [...e.messages].reverse().find(m => m.role === 'user')
          const content = typeof userMsg?.content === 'string' ? userMsg.content : '(不明)'
          this.current = { user: content, calls: [], response: '' }
        }
        break

      case 'tool_call':
        if (this.current) {
          this.pendingCall = { tool: e.toolName, args: this.fmtArgs(e.args) }
          this.current.calls.push(this.pendingCall)
        }
        break

      case 'tool_result':
        if (this.pendingCall && this.pendingCall.tool === e.toolName) {
          this.pendingCall.result = this.fmtResult(e.result)
          this.pendingCall = null
        }
        break

      case 'response':
        if (this.current) {
          this.current.response = e.text
          this.turns.push(this.current)
          this.current = null
        }
        break
    }
  }

  getLog(): string {
    if (this.turns.length === 0) return '（ログなし）'
    const lines: string[] = ['=== AI デバッグログ ===', '']
    for (let i = 0; i < this.turns.length; i++) {
      const t = this.turns[i]
      lines.push(`[ターン ${i + 1}] User: ${t.user}`)
      for (const c of t.calls) {
        const tag = c.tool.startsWith('propose_') ? ' [確認]' : ''
        lines.push(`  → ${c.tool}(${c.args})${tag}`)
        if (c.result !== undefined) lines.push(`  ← ${c.result}`)
      }
      const resp = t.response.length > 200 ? t.response.slice(0, 200) + '…' : t.response
      lines.push(`  AI: ${resp}`)
      lines.push('')
    }
    return lines.join('\n')
  }

  clear(): void {
    this.turns = []
    this.current = null
    this.pendingCall = null
  }
}

// ── InMemoryTraceObserver (for UI panel) ──────────────────────────────────────
// Stores events in memory and notifies subscribers so the UI can render a
// live tool-call timeline without needing console access.

export type TimedTraceEvent = AITraceEvent & { ts: number }

export class InMemoryTraceObserver implements AITraceObserver {
  private events: TimedTraceEvent[] = []
  private listeners: Set<() => void> = new Set()

  onEvent(event: AITraceEvent): void {
    this.events.push({ ...event, ts: Date.now() })
    this.listeners.forEach(fn => fn())
  }

  getEvents(): readonly TimedTraceEvent[] { return this.events }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  clear(): void {
    this.events = []
    this.listeners.forEach(fn => fn())
  }
}

// ── NoopTraceObserver (production / mock) ─────────────────────────────────────

export class NoopTraceObserver implements AITraceObserver {
  onEvent(_event: AITraceEvent): void { /* intentionally empty */ }
}

// ── CompositeTraceObserver (for multi-agent: fan-out to many observers) ───────

export class CompositeTraceObserver implements AITraceObserver {
  constructor(private readonly observers: AITraceObserver[]) {}

  onEvent(event: AITraceEvent): void {
    for (const obs of this.observers) obs.onEvent(event)
  }
}
