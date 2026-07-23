import { create } from 'zustand/react'
import { ALL_EDIT_PATTERNS, EDIT_PATTERN_META, type EditPattern } from '@personnel/domain/patterns/defs'
import { ISSUE_TYPE_METAS } from '@personnel/domain/rules/validate/issueTypeMeta'

// ── プリセット ────────────────────────────────────────────────────────────────

export type DisplayPreset = 'full' | 'standard' | 'beginner' | 'custom'

/** 初心者向けプリセットで表示するパターン（主要10種） */
export const BEGINNER_PATTERNS: ReadonlySet<EditPattern> = new Set<EditPattern>([
  'promotion', 'demotion',
  'orgTransfer', 'newPosition',
  'leaveOfAbsence', 'returnFromLeave',
  'executiveAppointment', 'employmentTransfer', 'termination',
  'secondmentOut',
])

export function patternsForPreset(preset: DisplayPreset): Set<EditPattern> {
  switch (preset) {
    case 'full':
      return new Set(ALL_EDIT_PATTERNS)
    case 'standard':
      return new Set(ALL_EDIT_PATTERNS.filter(p => EDIT_PATTERN_META[p]?.defaultVisible))
    case 'beginner':
      return new Set(BEGINNER_PATTERNS)
    case 'custom':
      return new Set(ALL_EDIT_PATTERNS.filter(p => EDIT_PATTERN_META[p]?.defaultVisible))
  }
}

export function issueIdsForPreset(preset: DisplayPreset): Set<string> {
  switch (preset) {
    case 'full':
      return new Set(ISSUE_TYPE_METAS.map(m => m.id))
    case 'standard':
      return new Set(ISSUE_TYPE_METAS.filter(m => m.defaultVisible).map(m => m.id))
    case 'beginner':
      return new Set(ISSUE_TYPE_METAS.filter(m => m.level === 'error' && m.defaultVisible).map(m => m.id))
    case 'custom':
      return new Set(ISSUE_TYPE_METAS.filter(m => m.defaultVisible).map(m => m.id))
  }
}

// ── 永続化 ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'display_preference'

interface StoredState {
  preset:          DisplayPreset
  visiblePatterns: EditPattern[]
  visibleIssueIds: string[]
}

function loadFromStorage(): Pick<DisplayPreferenceState, 'preset' | 'visiblePatterns' | 'visibleIssueIds'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildFromPreset('standard')
    const parsed = JSON.parse(raw) as Partial<StoredState>
    const preset = isValidPreset(parsed.preset) ? parsed.preset : 'standard'
    if (preset !== 'custom') return buildFromPreset(preset)
    // custom: stored arrays → Set
    const vp = Array.isArray(parsed.visiblePatterns)
      ? new Set(parsed.visiblePatterns.filter(isValidPattern))
      : patternsForPreset('standard')
    const vi = Array.isArray(parsed.visibleIssueIds)
      ? new Set(parsed.visibleIssueIds.filter(isValidIssueId))
      : issueIdsForPreset('standard')
    return { preset: 'custom', visiblePatterns: vp, visibleIssueIds: vi }
  } catch {
    return buildFromPreset('standard')
  }
}

function buildFromPreset(preset: DisplayPreset): Pick<DisplayPreferenceState, 'preset' | 'visiblePatterns' | 'visibleIssueIds'> {
  return { preset, visiblePatterns: patternsForPreset(preset), visibleIssueIds: issueIdsForPreset(preset) }
}

function saveToStorage(state: Pick<DisplayPreferenceState, 'preset' | 'visiblePatterns' | 'visibleIssueIds'>): void {
  const stored: StoredState = {
    preset:          state.preset,
    visiblePatterns: [...state.visiblePatterns],
    visibleIssueIds: [...state.visibleIssueIds],
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)) } catch { /* ignore */ }
}

function isValidPreset(v: unknown): v is DisplayPreset {
  return v === 'full' || v === 'standard' || v === 'beginner' || v === 'custom'
}

function isValidPattern(p: unknown): p is EditPattern {
  return typeof p === 'string' && (ALL_EDIT_PATTERNS as string[]).includes(p)
}

const ISSUE_ID_SET = new Set(ISSUE_TYPE_METAS.map(m => m.id))
function isValidIssueId(c: unknown): c is string {
  return typeof c === 'string' && ISSUE_ID_SET.has(c)
}

// ── ストア ────────────────────────────────────────────────────────────────────

export interface DisplayPreferenceState {
  preset:          DisplayPreset
  visiblePatterns: Set<EditPattern>
  visibleIssueIds: Set<string>

  /** プリセットを適用して visiblePatterns / visibleIssueIds を再計算する */
  applyPreset:   (preset: DisplayPreset) => void
  /** パターンの表示/非表示をトグル（preset を 'custom' に切り替える） */
  togglePattern: (key: EditPattern) => void
  /** 問題IDの表示/非表示をトグル（preset を 'custom' に切り替える） */
  toggleIssueId: (id: string) => void
}

export const useDisplayPreferenceStore = create<DisplayPreferenceState>()(set => {
  const initial = loadFromStorage()
  return {
    ...initial,

    applyPreset: (preset) => {
      const next = buildFromPreset(preset)
      saveToStorage(next)
      set(next)
    },

    togglePattern: (key) =>
      set(state => {
        const next = new Set(state.visiblePatterns)
        if (next.has(key)) next.delete(key)
        else               next.add(key)
        const nextState = { preset: 'custom' as const, visiblePatterns: next, visibleIssueIds: state.visibleIssueIds }
        saveToStorage(nextState)
        return nextState
      }),

    toggleIssueId: (id) =>
      set(state => {
        const next = new Set(state.visibleIssueIds)
        if (next.has(id)) next.delete(id)
        else              next.add(id)
        const nextState = { preset: 'custom' as const, visiblePatterns: state.visiblePatterns, visibleIssueIds: next }
        saveToStorage(nextState)
        return nextState
      }),
  }
})
