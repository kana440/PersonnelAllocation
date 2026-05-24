// AI Trace — observer interface and built-in implementations.
//
// To add a new observer (e.g. for multi-agent routing, UI panel, test recording):
//   1. Implement AITraceObserver
//   2. Pass it to AgentRunner (or wrap with CompositeTraceObserver)
//
// agentId in each event is optional now; fill it in when you introduce named sub-agents.

import type { APIMessage } from '../../ports'

// ── Event types ───────────────────────────────────────────────────────────────

export type AITraceEvent =
  | { kind: 'request';     agentId?: string; round: number; messages: APIMessage[] }
  | { kind: 'tool_call';   agentId?: string; round: number; toolName: string; args: unknown }
  | { kind: 'tool_result'; agentId?: string; round: number; toolName: string; result: string }
  | { kind: 'response';    agentId?: string; text: string }
  | { kind: 'error';       agentId?: string; error: unknown }

// ── Observer interface ────────────────────────────────────────────────────────

export interface AITraceObserver {
  onEvent(event: AITraceEvent): void
}

// ── ConsoleTraceObserver ──────────────────────────────────────────────────────

export class ConsoleTraceObserver implements AITraceObserver {
  private label(e: AITraceEvent) {
    return e.agentId ? `[AI Trace / ${e.agentId}]` : '[AI Trace]'
  }

  onEvent(e: AITraceEvent): void {
    const prefix = this.label(e)
    switch (e.kind) {
      case 'request':
        console.groupCollapsed(`${prefix} round ${e.round} → request (${e.messages.length} messages)`)
        e.messages.forEach((m, i) => {
          const tag = m.tool_call_id ? ` (tool_call_id: ${m.tool_call_id})` : ''
          console.log(`[${i}] ${m.role}${tag}:`, m.content, m.tool_calls ?? '')
        })
        console.groupEnd()
        break

      case 'tool_call':
        console.groupCollapsed(`${prefix} round ${e.round} → tool_call: ${e.toolName}`)
        console.log('args:', e.args)
        console.groupEnd()
        break

      case 'tool_result':
        console.groupCollapsed(`${prefix} round ${e.round} → tool_result: ${e.toolName}`)
        console.log('result:', e.result)
        console.groupEnd()
        break

      case 'response':
        console.log(`${prefix} response:`, e.text)
        break

      case 'error':
        console.error(`${prefix} error:`, e.error)
        break
    }
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
