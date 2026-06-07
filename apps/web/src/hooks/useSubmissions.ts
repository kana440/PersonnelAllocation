import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../infrastructure/api/adminApi'

const KEYS = {
  submissions: ['submissions'] as const,
  submission:  (id: string) => ['submissions', id] as const,
  children:    (id: string) => ['submissions', id, 'children'] as const,
  rows:        (id: string) => ['submissions', id, 'rows'] as const,
} as const

// ── フェッチ系 ────────────────────────────────────────────────────────────────

export function useSubmissions() {
  return useQuery({
    queryKey: KEYS.submissions,
    queryFn:  () => adminApi.submissions.list(),
  })
}

export function useSubmission(id: string) {
  return useQuery({
    queryKey: KEYS.submission(id),
    queryFn:  () => adminApi.submissions.get(id),
    enabled:  !!id,
  })
}

export function useSubmissionChildren(id: string) {
  return useQuery({
    queryKey: KEYS.children(id),
    queryFn:  () => adminApi.submissions.getChildren(id),
    enabled:  !!id,
  })
}

export function useSubmissionRows(id: string) {
  return useQuery({
    queryKey: KEYS.rows(id),
    queryFn:  () => adminApi.submissions.getRows(id),
    enabled:  !!id,
    staleTime: 0,  // 編集中は常に最新データを取得
  })
}

// ── ミューテーション系 ─────────────────────────────────────────────────────────

export function useCreateSubmissionMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.submissions.create,
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: KEYS.submissions }) },
  })
}

export function usePutRowsMutation(submissionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: unknown[]) => adminApi.submissions.putRows(submissionId, rows),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: KEYS.rows(submissionId) }) },
  })
}

export function useSubmitMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force = false }: { id: string; force?: boolean }) =>
      adminApi.submissions.submit(id, { force }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEYS.submissions }) },
  })
}

export function useMergeMutation(parentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (childId: string) => adminApi.submissions.merge(childId),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: KEYS.children(parentId) })
      void qc.invalidateQueries({ queryKey: KEYS.submissions })
    },
  })
}

export function useRequestRevisionMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      adminApi.submissions.requestRevision(id, comment),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: KEYS.submission(id) })
      void qc.invalidateQueries({ queryKey: KEYS.submissions })
    },
  })
}
