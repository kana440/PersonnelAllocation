import type { OrgViewContextValue } from '../../components/canvas/OrgViewContext'

/**
 * OrgViewContextValue のうち、Phase 1（実データ・実RowCard検証）で実装不要な
 * ドラッグ&ドロップ由来の変更系ハンドラをまとめた no-op スタブ。
 * 「イベントが発火したか」だけ console.log で確認できるようにしている。
 * 実データ描画に必要な positionTreeByOrgId・afterOrgByCode・handlePersonClick 等は
 * 呼び出し側で本物の値に差し替えること。
 */
export function createNoOpOrgViewHandlers(): Pick<OrgViewContextValue,
  | 'dragOverOrgId' | 'setDragOverOrgId' | 'highlightedOrgId'
  | 'dragOverVacantRowId' | 'setDragOverVacantRowId'
  | 'dropPersonRowId' | 'setDropPersonRowId'
  | 'dropGapBelowRowId' | 'setDropGapBelowRowId'
  | 'openDropIntent' | 'openBandDrop' | 'openGroupFormDrop'
  | 'handleDragOver' | 'handleDragLeave' | 'handleDrop'
  | 'handleDropOnVacantSlot' | 'handleAddPosition' | 'handleSecondmentIn'
  | 'topPositionCodeOfOrg' | 'setBulkMoveSourceId' | 'setConfirmDialog'
  | 'addPersonsToSelection' | 'clearSelection' | 'isHistoryPreviewMode'
  | 'handlePersonDoubleClick' | 'handleRowDoubleClick'
  | 'handleDropPositionOnPosition' | 'handleReorderRow'
  | 'expandedChipIds' | 'toggleChip'
> {
  const log = (label: string) => (...args: unknown[]) => console.log(`[phase1] ${label} fired`, ...args)

  return {
    dragOverOrgId:       null,
    setDragOverOrgId:    log('setDragOverOrgId'),
    highlightedOrgId:    null,
    dragOverVacantRowId: null,
    setDragOverVacantRowId: log('setDragOverVacantRowId'),
    dropPersonRowId:     null,
    setDropPersonRowId:  log('setDropPersonRowId'),
    dropGapBelowRowId:   null,
    setDropGapBelowRowId: log('setDropGapBelowRowId'),
    openDropIntent:      log('openDropIntent'),
    openBandDrop:        log('openBandDrop'),
    openGroupFormDrop:   log('openGroupFormDrop'),
    handleDragOver:      () => {},
    handleDragLeave:     () => {},
    handleDrop:          log('handleDrop'),
    handleDropOnVacantSlot: log('handleDropOnVacantSlot'),
    handleAddPosition:   log('handleAddPosition'),
    handleSecondmentIn:  log('handleSecondmentIn'),
    topPositionCodeOfOrg: () => undefined,
    setBulkMoveSourceId: () => {},
    setConfirmDialog:    () => {},
    addPersonsToSelection: () => {},
    clearSelection:      () => {},
    isHistoryPreviewMode: false,
    handlePersonDoubleClick: log('handlePersonDoubleClick'),
    handleRowDoubleClick:    log('handleRowDoubleClick'),
    handleDropPositionOnPosition: log('handleDropPositionOnPosition'),
    handleReorderRow:    log('handleReorderRow'),
    expandedChipIds:     new Set<string>(),
    toggleChip:          () => {},
  }
}
