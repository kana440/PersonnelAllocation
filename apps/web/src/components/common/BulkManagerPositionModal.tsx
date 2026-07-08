import { useMemo } from 'react'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import { computeInvalidManagerCandidates } from '@personnel/domain/rules/interRow/managerChain'
import { appService } from '../../application/HRApplicationService'
import { PositionPickerModal } from './PositionPickerModal'

interface Props {
  /** 上司ポジションを一括変更する対象行（呼び出し側で personId→row 等の解決済みのもの） */
  rows:               AllocationRow[]
  allocationList:     AllocationRow[]
  afterOrganizations: Organization[]
  onDone:             () => void
  onCancel:           () => void
}

/**
 * 個別画面（RowEditorPanel の ManagerPositionRow）と同じ PositionPickerModal を使う
 * 一括上司変更ピッカー。グローバル検索（担当者にフィルタしない全社検索）はそのまま流用しつつ、
 * 対象行のいずれかに対して自己参照・循環参照になる候補はプロアクティブに除外する
 * （単体編集は事後バリデーションのみだが、一括変更はN件まとめて事後訂正するのが難しいため）。
 */
export function BulkManagerPositionModal({ rows, allocationList, afterOrganizations, onDone, onCancel }: Props) {
  const selfPositionCodes = useMemo(
    () => new Set(rows.map(r => r.positionCode).filter((c): c is string => !!c)),
    [rows],
  )
  const invalidCandidates = useMemo(
    () => computeInvalidManagerCandidates(selfPositionCodes, allocationList),
    [selfPositionCodes, allocationList],
  )

  return (
    <PositionPickerModal
      allocationList={allocationList}
      afterOrganizations={afterOrganizations}
      occupiedOnly
      filter={r => !invalidCandidates.has(r.positionCode as string)}
      onSelect={(posCode, personName) => {
        for (const row of rows) {
          appService.saveRow(row.rowId, { managerPositionCode: posCode, managerName: personName })
        }
        onDone()
      }}
      onClose={onCancel}
    />
  )
}
