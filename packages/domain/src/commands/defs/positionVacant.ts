/**
 * 空きポジション操作の基本関数
 *
 * 設計思想: 人基軸（Person-centric）
 *   - 人行（personRow）にポジション情報を転記する。人行の rowId が残る。
 *   - 空席行（vacantRow）は削除される。
 *   - 詳細: docs/10-vacant-position.md
 */
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, FIELD_METADATA, nextRowId } from '../../allocationRow'
import type { DomainContext } from '../types'
import type { EditOperation } from './types'
import { deriveFieldUpdates } from '../../rules/derive'

// ── 人フィールドのクリア定義 ──────────────────────────────────────────────────

/** 人の身元フィールド（FIELD_METADATA 外）。空席化時にクリアが必要。 */
const IDENTITY_CLEARS: Readonly<Record<string, undefined>> = {
  userId:            undefined,
  lastName:          undefined,
  firstName:         undefined,
  groupEmployeeId:   undefined,
  employeeNumber:    undefined,
}

/** 操作メタフィールド。空席化・アサイン時にクリア。 */
const META_CLEARS: Readonly<Record<string, undefined>> = {
  transferReason:     undefined,
  memo:               undefined,
  promotionSign:      undefined,
  demotionReason:     undefined,
  payGradeChangeSign: undefined,
  operationGroupId:   undefined,
  _leaveSourceVacant: undefined,
  _targetPositionCode: undefined,
}

/** jobInfo binding フィールドのクリア（concurrentType/concurrentReason を含む）。 */
const jobInfoClears = () =>
  Object.fromEntries(afterKeysByBinding('jobInfo').map(k => [k, undefined]))

// ── 判定 ──────────────────────────────────────────────────────────────────────

/** 空席ポジション: positionCode あり + userId なし */
export function isVacantPosition(row: AllocationRow): boolean {
  return !!(row.positionCode as string | undefined) && !(row.userId as string | undefined)
}

/** 在席ポジション: positionCode あり + userId あり */
export function isOccupiedPosition(row: AllocationRow): boolean {
  return !!(row.positionCode as string | undefined) && !!(row.userId as string | undefined)
}

/** 未アサイン人: userId あり + positionCode なし */
export function isUnassignedPerson(row: AllocationRow): boolean {
  return !!(row.userId as string | undefined) && !(row.positionCode as string | undefined)
}

// ── 空席化 ────────────────────────────────────────────────────────────────────

/**
 * 在席行を空席ポジション行に変換する（rowId 維持）。
 *
 * クリアするフィールド:
 *   - 人の身元: userId / lastName / firstName / groupEmployeeId / employeeNumber
 *   - 雇用情報（jobInfo binding）: band / payGrade / employmentType /
 *       concurrentType / concurrentReason / secondment 系 など
 *   - 操作メタ: transferReason / memo / promotionSign 等
 *
 * concurrentType / concurrentReason は人の属性。空席ポジションに本務・兼務区分はない。
 * 保持するフィールド: position binding + both binding + prevXxx（before 状態は不変）
 */
export function vacatePosition(row: AllocationRow): AllocationRow {
  return {
    ...row,
    ...IDENTITY_CLEARS,
    ...jobInfoClears(),
    ...META_CLEARS,
  }
}

/**
 * 人行から新しい空席行を生成する（新規 rowId を採番）。
 * 元の人行の position / both フィールドを引き継ぐ。
 * 用途: 人が移動した後「元のポジションを空席として残す」ケース。
 */
export function makeVacantRowFrom(personRow: AllocationRow, list: AllocationRow[]): AllocationRow {
  return { ...vacatePosition(personRow), rowId: nextRowId(list) }
}

/**
 * 空席行の position/both フィールドを Partial<AllocationRow> として抽出する。
 * 人の行に空きポジション情報を上書きするときに使用する。
 */
export function extractPositionFieldsFrom(vacantRow: AllocationRow): Partial<AllocationRow> {
  return Object.fromEntries(
    FIELD_METADATA
      .filter(f => f.binding === 'position' || f.binding === 'both')
      .map(f => [f.after, (vacantRow as Record<string, unknown>)[f.after as string]])
  )
}

// ── バンド変更チェック ─────────────────────────────────────────────────────────

/**
 * 人をポジションにアサインするとき、バンドが変わるかを確認する。
 * 変わる場合は { from, to } を、変わらない場合は null を返す。
 * アサイン前の確認ダイアログ表示に使う。
 */
export function wouldBandChange(
  personRow: AllocationRow,
  vacantRow:  AllocationRow,
): { from: string; to: string } | null {
  const currentBand  = personRow.band as string | undefined
  const positionBand = vacantRow.positionBand as string | undefined
  if (!positionBand || !currentBand || currentBand === positionBand) return null
  return { from: currentBand, to: positionBand }
}

// ── アサイン（人基軸） ────────────────────────────────────────────────────────

export interface AssignToVacantOptions {
  /**
   * 移動元ポジションに空席行を残すか（在籍人の場合のみ有効）。
   * true : 元の人行を空席化（rowId は新規採番）し、人行 rowId で filledRow を更新
   * false: 元の人行を filledRow で上書き（元ポジションは消える）
   */
  leaveSourceVacant: boolean
  /**
   * バンド上書きモード。
   * true : positionBand で band を上書きし payGrade を再導出する
   * false / 省略: 人の band をそのまま維持
   */
  overrideBand?: boolean
}

/**
 * 人行を空席ポジション行にアサインしてマージする（人基軸）。
 *
 * 【基本原則】
 *   - 生き残るのは人行（personRow.rowId）。ポジション情報を人行に転記する。
 *   - 削除されるのは空席行（vacantRow.rowId）。
 *
 * 【ケース A】未アサイン人 → 空席ポジション
 *   personRow（positionCode なし, userId あり）: ポジション情報を転記 → filledRow（personRow.rowId）
 *   vacantRow: 削除
 *
 * 【ケース B】在籍人 → 空席ポジション
 *   leaveSourceVacant=true:
 *     人行を filledRow（新ポジション情報, personRow.rowId）に更新
 *     元ポジションを新規 rowId の空席行として追加
 *     vacantRow: 削除
 *   leaveSourceVacant=false:
 *     人行を filledRow（新ポジション情報, personRow.rowId）で上書き
 *     元ポジションは消える（空席行を残さない）
 *     vacantRow: 削除
 *
 *   元ポジションに部下がいるかどうかの判断は呼び出し側が行い、leaveSourceVacant として渡す。
 */
export function assignPersonToVacant(
  personRow: AllocationRow,
  vacantRow:  AllocationRow,
  ctx:        DomainContext,
  options:    AssignToVacantOptions,
): { updatedList: AllocationRow[]; label: string } {
  const label = `配属: ${((personRow.lastName ?? '') + (personRow.firstName ?? '')) || (personRow.userId ?? '')}`

  // 空席行の position/both フィールドを抽出
  const positionOverride = Object.fromEntries(
    FIELD_METADATA
      .filter(f => f.binding === 'position' || f.binding === 'both')
      .map(f => [f.after, (vacantRow as Record<string, unknown>)[f.after as string]])
  ) as Partial<AllocationRow>

  // バンド上書き + 連鎖導出（payGrade 等）
  const bandDerived: Partial<AllocationRow> = options.overrideBand === true && vacantRow.positionBand
    ? deriveFieldUpdates(
        { band: vacantRow.positionBand as string } as Partial<AllocationRow>,
        personRow,
        ctx.masters,
        ctx.allocationList,
      ) as Partial<AllocationRow>
    : {}

  // 人行 rowId を維持して filledRow を構築
  const filledRow: AllocationRow = {
    ...personRow,
    ...positionOverride,
    ...bandDerived,
    ...META_CLEARS,
  }

  const isOccupied = isOccupiedPosition(personRow)

  if (isOccupied && options.leaveSourceVacant) {
    // ケース B + leaveSourceVacant=true:
    //   人行を filledRow（新ポジション情報, 同 rowId）で更新し、
    //   元ポジションを新規 rowId の空席行として追加、空席行(vacantRow)は削除。
    const listWithFilled = ctx.allocationList
      .filter(r => r.rowId !== vacantRow.rowId)
      .map(r => r.rowId === personRow.rowId ? filledRow : r)
    const sourceVacantRow = { ...vacatePosition(personRow), rowId: nextRowId(listWithFilled) }
    return { updatedList: [...listWithFilled, sourceVacantRow], label }
  }

  // ケース A（未アサイン人）または ケース B + leaveSourceVacant=false:
  //   人行を filledRow で上書き、空席行(vacantRow)を削除。
  return {
    updatedList: ctx.allocationList
      .filter(r => r.rowId !== vacantRow.rowId)
      .map(r => r.rowId === personRow.rowId ? filledRow : r),
    label,
  }
}

// ── 部下カウント ──────────────────────────────────────────────────────────────

/**
 * 指定した行に対して「部下」（prevManagerPositionCode が一致する別行）の数を返す。
 */
export function countSubordinates(row: AllocationRow, allocationList: AllocationRow[]): number {
  const prevPosCode = row.prevPositionCode as string | undefined
  if (!prevPosCode) return 0
  return allocationList.filter(
    r => r.rowId !== row.rowId &&
      (r.prevManagerPositionCode as string | undefined) === prevPosCode
  ).length
}

// ── 現在状態ベースの部下取得（ドラッグ操作用） ────────────────────────────────

/** 現在の managerPositionCode === row.positionCode の行を直属部下として返す */
export function getDirectSubordinates(row: AllocationRow, allocationList: AllocationRow[]): AllocationRow[] {
  const posCode = row.positionCode as string | undefined
  if (!posCode) return []
  return allocationList.filter(
    r => r.rowId !== row.rowId &&
      (r.managerPositionCode as string | undefined) === posCode
  )
}

/** 直属部下のうち同一組織（departmentCode が一致）の行のみ返す */
export function getSameOrgSubordinates(row: AllocationRow, allocationList: AllocationRow[]): AllocationRow[] {
  return getDirectSubordinates(row, allocationList).filter(
    r => r.departmentCode === row.departmentCode
  )
}

/** 直属部下のうち別組織（departmentCode が不一致）の行のみ返す */
export function getOtherOrgSubordinates(row: AllocationRow, allocationList: AllocationRow[]): AllocationRow[] {
  return getDirectSubordinates(row, allocationList).filter(
    r => r.departmentCode !== row.departmentCode
  )
}

// ── withLeavePositionVacant ───────────────────────────────────────────────────

/**
 * EditOperation をラップして「移動後に元ポジションを空席行として残す」挙動を追加する。
 *
 * 処理内容:
 *   1. ベース操作を実行（人が新組織へ移動、新規内部ポジションコード付与）
 *   2. 元ポジションの position/both フィールドを引き継いだ空席行を末尾に追加
 *
 * supportsLeaveVacant: true の def に対して UI 側から呼び出す。
 * ドラッグ（DragIntentPicker）と通常 Edit（OperationFormView）で共用する。
 *
 * 二重ラップ防止: supportsLeaveVacant を undefined にセットして
 * OperationFormView が再ラップしないようにする。
 */
export function withLeavePositionVacant(baseDef: EditOperation): EditOperation {
  return {
    ...baseDef,
    supportsLeaveVacant: undefined,  // 二重ラップ防止
    createCommand(rowId, values) {
      const baseCmd = baseDef.createCommand(rowId, values)
      return {
        kind: baseCmd.kind,
        validate: (ctx) => baseCmd.validate(ctx),
        apply(ctx) {
          const row        = ctx.allocationList.find(r => r.rowId === rowId)
          const oldPosCode = row?.positionCode as string | undefined

          if (!oldPosCode || !row) {
            return baseCmd.apply(ctx)
          }

          const baseResult = baseCmd.apply(ctx)

          // 新しい rowId / posCode を衝突なく採番
          const maxRowId    = Math.max(0, ...baseResult.updatedList.map(r => r.rowId))
          const vacantRowId = maxRowId + 1
          const newPosCode  = `_pos_${maxRowId + 2}`

          // 移動した人に新ポジションコードを付与
          const updatedWithNewPos = baseResult.updatedList.map(r =>
            r.rowId === rowId ? { ...r, positionCode: newPosCode } : r
          )

          // 元ポジションの属性（position/both binding）を引き継いだ空席行を作成
          const vacantRow = {
            rowId: vacantRowId,
            ...Object.fromEntries(
              afterKeysByBinding('position').map(k => [k, (row as Record<string, unknown>)[k as string]])
            ),
            ...Object.fromEntries(
              afterKeysByBinding('both').map(k => [k, (row as Record<string, unknown>)[k as string]])
            ),
          } as AllocationRow

          return {
            updatedList: [...updatedWithNewPos, vacantRow],
            label: `${baseResult.label}（元ポジション空席）`,
          }
        },
      }
    },
  }
}
