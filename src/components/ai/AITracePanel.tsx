import { useState, useEffect, useCallback } from 'react'
import type { InMemoryTraceObserver, TimedTraceEvent } from '../../infrastructure/ai/aiTrace'
import { TOOL_LABELS } from '../../infrastructure/ai/toolLabels'

interface Props {
  traceObserver: InMemoryTraceObserver
  onCopyLog: () => void
  logCopied: boolean
}

function formatTime(ts: number, base: number): string {
  const ms = ts - base
  return ms < 1000 ? `+${ms}ms` : `+${(ms / 1000).toFixed(1)}s`
}

function EventRow({ event, base }: { event: TimedTraceEvent; base: number }) {
  const [open, setOpen] = useState(false)
  const timeLabel = formatTime(event.ts, base)

  if (event.kind === 'tool_call') {
    const argsStr = JSON.stringify(event.args, null, 2)
    const label = TOOL_LABELS[event.toolName] ?? event.toolName
    return (
      <div className="border-l-2 border-blue-300 pl-2">
        <button
          className="flex items-center gap-1.5 w-full text-left"
          onClick={() => setOpen(o => !o)}
        >
          <span className="text-blue-600 font-mono text-xs">→</span>
          <span className="text-xs font-medium text-gray-700">{label}</span>
          <span className="text-xs text-gray-400 font-mono">{event.toolName}</span>
          <span className="text-xs text-gray-400 ml-auto">{timeLabel}</span>
        </button>
        {open && (
          <pre className="text-xs text-gray-500 mt-1 bg-gray-50 rounded p-1.5 overflow-auto max-h-32">{argsStr}</pre>
        )}
      </div>
    )
  }

  if (event.kind === 'tool_result') {
    let parsed: unknown = event.result
    try { parsed = JSON.parse(event.result) } catch { /* keep */ }
    const resultStr = JSON.stringify(parsed, null, 2)
    const isError = typeof parsed === 'object' && parsed !== null && 'error' in parsed
    const label = TOOL_LABELS[event.toolName] ?? event.toolName
    return (
      <div className="border-l-2 border-green-300 pl-2">
        <button
          className="flex items-center gap-1.5 w-full text-left"
          onClick={() => setOpen(o => !o)}
        >
          <span className={`font-mono text-xs ${isError ? 'text-red-500' : 'text-green-600'}`}>←</span>
          <span className={`text-xs ${isError ? 'text-red-600' : 'text-gray-500'}`}>
            {label}
          </span>
          <span className="text-xs text-gray-400 ml-auto">{timeLabel}</span>
        </button>
        {open && (
          <pre className="text-xs text-gray-500 mt-1 bg-gray-50 rounded p-1.5 overflow-auto max-h-32">{resultStr}</pre>
        )}
      </div>
    )
  }

  if (event.kind === 'request') {
    const { params, round, messages } = event
    const paramsLabel = [
      params?.model && `model: ${params.model}`,
      params?.toolCount != null && `tools: ${params.toolCount}`,
    ].filter(Boolean).join('  ')

    // Round 0: show system prompt + initial user message (expandable)
    if (round === 0) {
      const systemMsg = messages.find(m => m.role === 'system')
      const userMsg   = [...messages].reverse().find(m => m.role === 'user')
      return (
        <div className="border-l-2 border-purple-200 pl-2">
          <button
            className="flex items-center gap-1.5 w-full text-left text-xs text-gray-400"
            onClick={() => setOpen(o => !o)}
          >
            <span>{open ? '▾' : '▸'}</span>
            <span className="text-purple-500 font-medium">API リクエスト</span>
            {paramsLabel && <span className="text-gray-300 font-mono">{paramsLabel}</span>}
            <span className="ml-auto">{timeLabel}</span>
          </button>
          {open && (
            <div className="mt-1 space-y-1.5">
              {systemMsg && (
                <div>
                  <div className="text-xs text-purple-500 font-medium mb-0.5">system prompt</div>
                  <pre className="text-xs text-gray-600 bg-purple-50 rounded p-1.5 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                    {typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content, null, 2)}
                  </pre>
                </div>
              )}
              {userMsg && (
                <div>
                  <div className="text-xs text-blue-500 font-medium mb-0.5">user</div>
                  <pre className="text-xs text-gray-600 bg-blue-50 rounded p-1.5 overflow-auto max-h-20 whitespace-pre-wrap">
                    {typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // Round 1+: just a separator (tool_call / tool_result events show the details)
    return (
      <div className="text-xs text-gray-300 py-0.5 pl-2 border-l-2 border-gray-100">
        ─ Round {round} {paramsLabel && <span className="font-mono">{paramsLabel}</span>}
        <span className="ml-auto float-right">{timeLabel}</span>
      </div>
    )
  }

  if (event.kind === 'tier_decision') {
    const tierLabel = { guide: 'Guide', simple_write: 'Simple Write', wizard: 'Wizard' }[event.tier]
    return (
      <div className="border-l-2 border-orange-300 pl-2">
        <button
          className="flex items-center gap-1.5 w-full text-left"
          onClick={() => setOpen(o => !o)}
        >
          <span className="text-orange-500 text-xs font-medium">⬡ Tier</span>
          <span className="text-xs text-gray-700">{tierLabel}</span>
          <span className="text-xs text-gray-400">— {event.intent}</span>
          <span className="text-xs text-gray-400 ml-auto">{timeLabel}</span>
        </button>
        {open && event.params && (
          <pre className="text-xs text-gray-500 mt-1 bg-orange-50 rounded p-1.5 overflow-auto max-h-24">
            {JSON.stringify(event.params, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  if (event.kind === 'error') {
    return (
      <div className="text-xs text-red-500 border-l-2 border-red-300 pl-2 py-0.5">
        エラー: {String(event.error)}
      </div>
    )
  }

  return null
}

export function AITracePanel({ traceObserver, onCopyLog, logCopied }: Props) {
  const [events, setEvents] = useState<readonly TimedTraceEvent[]>(() => traceObserver.getEvents())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    return traceObserver.subscribe(() => {
      setEvents(traceObserver.getEvents())
    })
  }, [traceObserver])

  const handleClear = useCallback(() => {
    traceObserver.clear()
  }, [traceObserver])

  const toolCallCount = events.filter(e => e.kind === 'tool_call').length
  const errorCount    = events.filter(e => e.kind === 'error').length
  const baseTs        = events[0]?.ts ?? Date.now()

  return (
    <div className="border-t border-gray-100">
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-1.5">
          <span>{open ? '▾' : '▸'}</span>
          <span>ツール履歴</span>
          {toolCallCount > 0 && (
            <span className="bg-gray-100 text-gray-600 rounded px-1">{toolCallCount} 回</span>
          )}
          {errorCount > 0 && (
            <span className="bg-red-100 text-red-600 rounded px-1">{errorCount} エラー</span>
          )}
        </span>
        <div className="flex gap-2">
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={e => { e.stopPropagation(); onCopyLog() }}
            title="サマリーログをコピー"
          >
            {logCopied ? '✓' : '📋'}
          </button>
          {events.length > 0 && (
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={e => { e.stopPropagation(); handleClear() }}
              title="履歴をクリア"
            >
              ✕
            </button>
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-2 max-h-48 overflow-y-auto space-y-1.5">
          {events.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">ツール呼び出しはまだありません</p>
          ) : (
            events.map((e, i) => <EventRow key={i} event={e} base={baseTs} />)
          )}
        </div>
      )}
    </div>
  )
}
