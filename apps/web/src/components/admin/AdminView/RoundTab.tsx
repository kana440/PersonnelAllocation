import { useState, useEffect, useCallback } from 'react'
import { adminApi, type ApiRound } from '../../../infrastructure/api/adminApi'
import { RoundTable }      from './SessionTable'
import { RoundCreateModal } from './RoundCreateModal'
import { RoundDetailView }  from './RoundDetailView'

interface Props {
  active:  boolean
  onError: (msg: string) => void
}

export function RoundTab({ active, onError }: Props) {
  const [rounds,        setRounds]        = useState<ApiRound[]>([])
  const [loading,       setLoading]       = useState(false)
  const [selectedRound, setSelectedRound] = useState<ApiRound | null>(null)
  const [showCreate,    setShowCreate]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRounds(await adminApi.rounds.list()) }
    catch (e) { onError(String(e)) }
    finally { setLoading(false) }
  }, [onError])

  useEffect(() => { if (active) void load() }, [active, load])

  return (
    <div className="bg-white rounded-lg shadow max-w-4xl mx-auto">
      {selectedRound ? (
        <RoundDetailView
          round={selectedRound}
          onBack={() => setSelectedRound(null)}
          onFinalized={() => { setSelectedRound(null); void load() }}
        />
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-700">
              申請回一覧{!loading && (
                <span className="text-gray-400 font-normal ml-1">（{rounds.length}件）</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => void load()} className="text-xs text-gray-500 hover:text-gray-700">更新</button>
              <button onClick={() => setShowCreate(true)}
                className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
                + 申請回を作成
              </button>
            </div>
          </div>
          {loading
            ? <div className="text-center py-16 text-gray-400 text-sm">読み込み中…</div>
            : <RoundTable rounds={rounds} onSelect={r => setSelectedRound(r)} />}
        </>
      )}
      {showCreate && (
        <RoundCreateModal
          onCreated={() => { setShowCreate(false); void load() }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
