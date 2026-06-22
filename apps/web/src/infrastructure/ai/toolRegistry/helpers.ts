// toolRegistry/helpers.ts — operationTools から使う共有ヘルパー
// execute 操作後に監視対象フィールドが意図せず変わっていた場合に diff-preview を返す。
// AI 開発者が所有。

import type { ChatWidget, PersonDiff } from '../../../application/aiTypes'
import { appService }                  from '../../../application/HRApplicationService'
import type { AllocationRow }          from '@personnel/domain/allocationRow'
import { FIELD_DISPLAY_LABELS }        from '@personnel/domain/csvImport/allocationList/labels'

// primaryField: 直接編集したフィールド（連動検出の対象外）
const CASCADE_LABELS: Partial<Record<keyof AllocationRow, string>> = {
  positionBand:         FIELD_DISPLAY_LABELS['positionBand']         ?? 'ポジションバンド',
  band:                 FIELD_DISPLAY_LABELS['band']                 ?? 'バンド',
  payGrade:             FIELD_DISPLAY_LABELS['payGrade']             ?? '給与等級',
  officialPositionCode: FIELD_DISPLAY_LABELS['officialPositionCode'] ?? '役職コード',
  localJobTitle:        FIELD_DISPLAY_LABELS['localJobTitle']        ?? '役職名',
  businessUnit:         FIELD_DISPLAY_LABELS['businessUnit']         ?? '関係部門',
  division:             FIELD_DISPLAY_LABELS['division']             ?? '部門',
  subDivision:          FIELD_DISPLAY_LABELS['subDivision']          ?? '統括部',
  group:                FIELD_DISPLAY_LABELS['group']                ?? 'グループ',
  team:                 FIELD_DISPLAY_LABELS['team']                 ?? 'チーム',
  managerName:          FIELD_DISPLAY_LABELS['managerName']          ?? '上司氏名',
  managerPositionCode:  FIELD_DISPLAY_LABELS['managerPositionCode']  ?? '上司ポジションコード',
  employmentType:       FIELD_DISPLAY_LABELS['employmentType']       ?? '雇用タイプ',
}

export function detectCascadeWidget(
  beforeRow:    AllocationRow,
  primaryField: string,
): ChatWidget | undefined {
  const snapshot = appService.getSnapshot()
  const afterRow  = snapshot.allocationList.find(r => r.rowId === beforeRow.rowId)
  if (!afterRow) return undefined

  const changed = (Object.entries(CASCADE_LABELS) as [keyof AllocationRow, string][])
    .filter(([k]) => k !== primaryField)
    .flatMap(([k, label]) => {
      const b = String(beforeRow[k] ?? '')
      const a = String(afterRow[k] ?? '')
      return b !== a ? [{ label, before: b || undefined, after: a || undefined }] : []
    })

  if (changed.length === 0) return undefined

  const name = [afterRow.lastName, afterRow.firstName].filter(Boolean).join(' ')
  const org  = snapshot.afterOrganizations.find(
    o => o.externalCode === afterRow.departmentCode || o.id === afterRow.departmentCode
  )
  const diff: PersonDiff = {
    userId:  afterRow.userId ?? '',
    name,
    orgName: org?.name ?? afterRow.departmentCode ?? '',
    rowId:   afterRow.rowId,
    before:  {},
    after:   {},
    fields:  changed,
  }
  return { type: 'diff-preview', persons: [diff], label: '変更結果（連動変更あり）' }
}
