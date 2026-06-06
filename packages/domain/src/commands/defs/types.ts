import type { AllocationRow }  from '../../allocationRow'
import type { AllCodeLists }   from '../../masters/aggregate'
import type { EditCommand }    from '../types'
import type { DomainContext } from '../types'

/**
 * 操作の概念グループ。UI でのメニュー分類・説明文に使用する。
 *   position        : ポジション操作（組織・上司・兼務など、席に関する変更）
 *   jobClassification: 職務情報操作（バンド・役職・ジョブタイプなど、任用条件の変更）
 *   person          : 人操作（在籍状況・雇用形態・出向・移籍など）
 */
export type OperationGroup = 'position' | 'jobClassification' | 'person'

/**
 * 操作の入力フィールド定義。
 * UI フォームでユーザーが入力する必要があるフィールドを宣言する。
 */
export interface OperationInput {
  readonly field:    keyof AllocationRow
  readonly required: boolean
  /** ラベル上書き。省略時は ALLOCATION_LIST_LABEL_MAP から取得 */
  readonly label?:   string
  /**
   * バンド選択肢を方向でフィルタリングする。
   * 'up' = 現在より上のバンドのみ（昇格用）、'down' = 下のみ（降格用）。
   * UI 側でステップ数セレクター（1段階/2段階/全て）と組み合わせて使用する。
   */
  readonly stepFilter?: 'up' | 'down'
}

/**
 * EditCommand 操作の宣言的定義。
 *
 * 各操作はこのインターフェースを実装するオブジェクトとして
 * src/domain/commands/defs/ に配置する。
 *
 * 追加・調整のルール:
 *   1. availableFor — メニュー表示条件をここで管理する
 *   2. inputs       — UI フォームのフィールド定義をここで管理する
 *   3. deriveInitial — 操作選択時の初期値（プレビュー・UndoStack 非対象）
 *   4. createCommand — 確定時の EditCommand 生成
 */
export interface OperationDef {
  /** 操作 ID。EditCommand.kind と対応させる */
  readonly id:         string
  /** UI 表示名 */
  readonly label:      string
  /** 概念グループ */
  readonly group:      OperationGroup
  /** バッジ色（Tailwind クラス） */
  readonly badgeColor: string

  /**
   * この操作が対象行に対してメニューに表示されるかどうか。
   * undefined = 常に表示。
   */
  availableFor(row: AllocationRow, codeLists: AllCodeLists): boolean

  /**
   * 操作選択時の初期フィールド値を計算する（プレビュー用・UndoStack 非対象）。
   * deriveFieldUpdates() はこの後に呼ばれるため、
   * ここでは操作固有の初期値のみ返せばよい。
   */
  deriveInitial(row: AllocationRow, ctx: DomainContext): Partial<AllocationRow>

  /** ユーザーが入力する必要があるフィールド（順序付き） */
  readonly inputs: OperationInput[]

  /** 確定時の EditCommand を生成する */
  createCommand(rowId: number, input: Partial<AllocationRow>): EditCommand
}
