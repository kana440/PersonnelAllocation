import { create } from 'zustand'
import type { FieldStrictness } from '../domain/optionStrictness'

const STORAGE_KEY           = 'canvas_display_fields'
const STRICTNESS_STORAGE_KEY = 'field_strictness_overrides'

export interface CanvasField {
  key:   string
  label: string
}

// All fields that can optionally appear on canvas cards.
// Fixed fields (positionCode, group, userId) are always shown and not listed here.
export const CANVAS_DISPLAYABLE_FIELDS: CanvasField[] = [
  { key: 'transferReason',        label: '異動事由' },
  { key: 'employmentType',        label: '雇用タイプ' },
  { key: 'band',                  label: 'バンド' },
  { key: 'payGrade',              label: '給与等級' },
  { key: 'businessUnit',          label: 'ビジネスユニット' },
  { key: 'division',              label: '部門' },
  { key: 'subDivision',           label: '統括部' },
  { key: 'team',                  label: 'チーム' },
  { key: 'jobFamily',             label: 'ジョブファミリー' },
  { key: 'jobType',               label: 'ジョブタイプ' },
  { key: 'managerName',           label: '上司氏名' },
  { key: 'managerPositionCode',   label: '上司ポジションコード' },
  { key: 'officialPositionCode',  label: '役職コード' },
  { key: 'positionBand',          label: 'ポジション_バンド' },
  { key: 'location',              label: '勤務場所' },
  { key: 'costCenter',            label: 'コストセンター' },
  { key: 'concurrentType',        label: '本務兼務区分' },
  { key: 'secondmentToCompany',   label: '出向先会社' },
  { key: 'secondmentFromCompany', label: '出向元会社' },
  { key: 'leaveFlag',             label: '休職者サイン' },
  { key: 'unionFlag',             label: '労働組合員' },
  { key: 'memo',                  label: 'メモ' },
]

const DEFAULT_FIELDS: string[] = ['band']

function loadFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_FIELDS
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) return parsed as string[]
  } catch { /* ignore */ }
  return DEFAULT_FIELDS
}

function loadStrictnessOverrides(): Partial<Record<string, FieldStrictness>> {
  try {
    const raw = localStorage.getItem(STRICTNESS_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<Record<string, FieldStrictness>>
  } catch { return {} }
}

interface CanvasDisplayState {
  displayFields:             string[]
  setDisplayFields:          (fields: string[]) => void
  fieldStrictnessOverrides:  Partial<Record<string, FieldStrictness>>
  setFieldStrictness:        (field: string, value: FieldStrictness | undefined) => void
}

export const useCanvasDisplayStore = create<CanvasDisplayState>(set => ({
  displayFields: loadFromStorage(),
  setDisplayFields: (fields) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields))
    set({ displayFields: fields })
  },
  fieldStrictnessOverrides: loadStrictnessOverrides(),
  setFieldStrictness: (field, value) => {
    set(state => {
      const next = { ...state.fieldStrictnessOverrides }
      if (value === undefined) delete next[field]
      else next[field] = value
      localStorage.setItem(STRICTNESS_STORAGE_KEY, JSON.stringify(next))
      return { fieldStrictnessOverrides: next }
    })
  },
}))
