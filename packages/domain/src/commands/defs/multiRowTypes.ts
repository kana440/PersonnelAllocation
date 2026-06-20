import type { AllocationRow } from '../../allocationRow'
import type { AllMasters }  from '../../masters/aggregate'
import type { DomainContext, EditCommand } from '../types'
import type { OperationInput } from './types'
import type { OperationBadge } from './badge'

export interface MultiRowFormSection {
  readonly label:             string
  /** 'delete' = 赤ヘッダー・削除確認表示。省略 = 通常入力セクション（青ヘッダー） */
  readonly style?:            'delete'
  /** true = 新規作成行。右列（発令前）を「—」で表示する */
  readonly isNewRow?:         boolean
  /** 'delete' セクションで削除対象行を探す関数 */
  readonly relatedRowFinder?: (anchor: AllocationRow, allRows: AllocationRow[]) => AllocationRow | undefined
  readonly inputs:            readonly OperationInput[]
  /** セクション上部に表示する補足テキスト */
  readonly notice?:           string
  /** 'delete' セクションに表示する説明文 */
  readonly deleteDescription?: string
}

export interface MultiRowOperationDef {
  readonly id:           string
  readonly label:        string
  readonly buttonLabel?: string
  readonly description?: string
  readonly badge?:       OperationBadge
  readonly affectedRowCount?: number

  availableFor(anchor: AllocationRow, ms: AllMasters, allRows: AllocationRow[]): boolean

  readonly sections: readonly MultiRowFormSection[]

  createCommand(
    anchorRowId:   number,
    sectionValues: Record<string, string>[],
    ctx:           DomainContext,
  ): EditCommand
}
