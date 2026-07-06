import { create } from 'zustand/react'
import type { UnavailableOperationDisplay } from '@personnel/domain/optionStrictness'
import { DEFAULT_UNAVAILABLE_OPERATION_DISPLAY } from '@personnel/domain/optionStrictness'
import { FIELD_DISPLAY_LABELS } from '@personnel/domain/csvImport/allocationList/labels'

const STORAGE_KEY                    = 'canvas_display_fields'
const UNAVAIL_OP_DISPLAY_STORAGE_KEY = 'unavailable_operation_display'
const COMPACT_GROUP_STORAGE_KEY      = 'compact_group_by'

export interface CanvasField {
  key:   string
  label: string
}

const f = (key: string): CanvasField => ({ key, label: FIELD_DISPLAY_LABELS[key] ?? key })

// All fields that can optionally appear on canvas cards.
// Fixed fields (positionCode, group, userId) are always shown and not listed here.
export const CANVAS_DISPLAYABLE_FIELDS: CanvasField[] = [
  f('transferReason'),
  f('employmentType'),
  f('band'),
  f('payGrade'),
  f('businessUnit'),
  f('division'),
  f('subDivision'),
  f('team'),
  f('jobFamily'),
  f('jobType'),
  f('managerName'),
  f('managerPositionCode'),
  f('officialPositionCode'),
  f('positionBand'),
  f('location'),
  f('costCenter'),
  f('concurrentType'),
  f('secondmentToCompany'),
  f('secondmentFromCompany'),
  f('leaveOfAbsenceSign'),
  f('unionFlag'),
  f('memo'),
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

function loadUnavailableOperationDisplay(): UnavailableOperationDisplay {
  try {
    const raw = localStorage.getItem(UNAVAIL_OP_DISPLAY_STORAGE_KEY)
    if (raw === 'hide' || raw === 'show' || raw === 'show-disabled') return raw
  } catch { /* ignore */ }
  return DEFAULT_UNAVAILABLE_OPERATION_DISPLAY
}

function loadCompactGroupById(): string {
  try {
    return localStorage.getItem(COMPACT_GROUP_STORAGE_KEY) ?? 'positionBand'
  } catch { return 'positionBand' }
}

interface CanvasDisplayState {
  displayFields:                  string[]
  setDisplayFields:               (fields: string[]) => void
  unavailableOperationDisplay:    UnavailableOperationDisplay
  setUnavailableOperationDisplay: (value: UnavailableOperationDisplay) => void
  compactGroupById:               string
  setCompactGroupById:            (id: string) => void
}

export const useCanvasDisplayStore = create<CanvasDisplayState>()(set => ({
  displayFields: loadFromStorage(),
  setDisplayFields: (fields) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields))
    set({ displayFields: fields })
  },
  unavailableOperationDisplay: loadUnavailableOperationDisplay(),
  setUnavailableOperationDisplay: (value) => {
    localStorage.setItem(UNAVAIL_OP_DISPLAY_STORAGE_KEY, value)
    set({ unavailableOperationDisplay: value })
  },
  compactGroupById: loadCompactGroupById(),
  setCompactGroupById: (id) => {
    localStorage.setItem(COMPACT_GROUP_STORAGE_KEY, id)
    set({ compactGroupById: id })
  },
}))
