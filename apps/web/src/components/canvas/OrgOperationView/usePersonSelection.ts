import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../../../store/useStore'
import { useChatStore } from '../../../store/useChatStore'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Person {
  id:        string
  sfPersonId?: string
  name?:     string
}

interface Deps {
  persons:        Person[]
  allocationList: AllocationRow[]
  selectPerson:   (id: string) => void
  selectCard:     (rowId: number | null, side: 'after') => void
}

interface Return {
  selectedPersonIds:    Set<string>
  isSelectMode:         boolean
  handleSelectPerson:   (personId: string, rowId?: number) => void
  handlePersonClick:    (personId: string, panelId: string, mods: { ctrl: boolean; shift: boolean }, rowId?: number) => void
  addPersonsToSelection: (ids: Set<string>) => void
  clearSelection:        () => void
  exitSelectMode:        () => void
}

export function usePersonSelection({ persons, allocationList, selectPerson, selectCard }: Deps): Return {
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set())
  const selectedPersonIdRef = useRef(useStore.getState().selectedPersonId)
  // track latest selectedPersonId for shift-click
  useEffect(() => {
    return useStore.subscribe(s => {
      selectedPersonIdRef.current = s.selectedPersonId
    })
  }, [])

  const lastClickRef = useRef<{ personId: string; panelId: string } | null>(null)
  const isSelectMode = selectedPersonIds.size > 0

  // sync selected persons to AI chat context
  useEffect(() => {
    if (selectedPersonIds.size === 0) return
    const rowIds = [...selectedPersonIds].flatMap(personId => {
      const p = persons.find(q => q.id === personId)
      if (!p?.sfPersonId) return []
      const rows = allocationList.filter(r => r.userId === p.sfPersonId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      return primary ? [primary.rowId] : []
    })
    if (rowIds.length > 0) useChatStore.getState().setChatContext(rowIds)
  }, [selectedPersonIds, persons, allocationList])

  const handleSelectPerson = useCallback((personId: string, rowId?: number) => {
    selectPerson(personId)
    selectCard(rowId ?? null, 'after')
    const p = persons.find(q => q.id === personId)
    if (p?.sfPersonId) {
      const rows = allocationList.filter(r => r.userId === p.sfPersonId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      if (primary) useChatStore.getState().setChatContext([primary.rowId])
    }
  }, [selectPerson, selectCard, persons, allocationList])

  const clearSelection = useCallback(() => {
    setSelectedPersonIds(new Set())
    useStore.setState({ selectedPersonId: null, selectedCardRowId: null })
  }, [])

  const addPersonsToSelection = useCallback((ids: Set<string>) => {
    setSelectedPersonIds(prev => new Set([...prev, ...ids]))
  }, [])

  const handlePersonClick = useCallback((
    personId: string, panelId: string,
    { ctrl, shift }: { ctrl: boolean; shift: boolean },
    rowId?: number,
  ) => {
    const t0 = performance.now()
    console.log('[perf] handlePersonClick start', { personId, rowId })
    if (ctrl) {
      setSelectedPersonIds(prev => {
        const next = new Set(prev)
        if (prev.size === 0 && selectedPersonIdRef.current) next.add(selectedPersonIdRef.current)
        next.has(personId) ? next.delete(personId) : next.add(personId)
        return next
      })
      lastClickRef.current = { personId, panelId }
    } else if (shift) {
      const last    = lastClickRef.current
      const panelEl = document.querySelector(`[data-panelid="${panelId}"]`)
      if (panelEl && last?.panelId === panelId) {
        const pids = [...panelEl.querySelectorAll<HTMLElement>('[data-personid]:not([data-personid=""])')]
          .map(el => el.getAttribute('data-personid')!)
        const a = pids.indexOf(last.personId)
        const b = pids.indexOf(personId)
        if (a !== -1 && b !== -1) {
          setSelectedPersonIds(prev => new Set([...prev, ...pids.slice(Math.min(a, b), Math.max(a, b) + 1)]))
        } else {
          setSelectedPersonIds(prev => new Set([...prev, personId]))
        }
      } else {
        setSelectedPersonIds(prev => new Set([...prev, personId]))
        lastClickRef.current = { personId, panelId }
      }
    } else {
      setSelectedPersonIds(new Set())
      console.log('[perf] before handleSelectPerson (store update)', performance.now() - t0, 'ms')
      handleSelectPerson(personId, rowId)
      console.log('[perf] after handleSelectPerson (sync done)', performance.now() - t0, 'ms')
      lastClickRef.current = { personId, panelId }
    }
  }, [handleSelectPerson])

  return {
    selectedPersonIds, isSelectMode,
    handleSelectPerson, handlePersonClick,
    addPersonsToSelection, clearSelection,
    exitSelectMode: clearSelection,
  }
}
