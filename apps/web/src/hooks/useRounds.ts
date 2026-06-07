import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type CreateRoundBody } from '../infrastructure/api/adminApi'

const KEYS = {
  rounds:    ['rounds'] as const,
  round:     (id: string) => ['rounds', id] as const,
  companies: (id: string) => ['rounds', id, 'companies'] as const,
  tree:      (id: string) => ['rounds', id, 'tree'] as const,
} as const

// ── フェッチ系 ────────────────────────────────────────────────────────────────

export function useRounds() {
  return useQuery({
    queryKey: KEYS.rounds,
    queryFn:  () => adminApi.rounds.list(),
  })
}

export function useRound(id: string) {
  return useQuery({
    queryKey: KEYS.round(id),
    queryFn:  () => adminApi.rounds.get(id),
    enabled:  !!id,
  })
}

export function useRoundCompanies(roundId: string) {
  return useQuery({
    queryKey: KEYS.companies(roundId),
    queryFn:  () => adminApi.rounds.getCompanies(roundId),
    enabled:  !!roundId,
  })
}

export function useRoundTree(roundId: string) {
  return useQuery({
    queryKey: KEYS.tree(roundId),
    queryFn:  () => adminApi.rounds.getTree(roundId),
    enabled:  !!roundId,
  })
}

// ── ミューテーション系 ─────────────────────────────────────────────────────────

export function useCreateRoundMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRoundBody) => adminApi.rounds.create(body),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: KEYS.rounds }) },
  })
}

export function useFinalizeRoundMutation(roundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.rounds.finalize(roundId),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: KEYS.round(roundId) })
      void qc.invalidateQueries({ queryKey: KEYS.rounds })
    },
  })
}
