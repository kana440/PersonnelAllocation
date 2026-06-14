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
  /** true のとき値を表示するが編集不可にする。deriveInitial で設定した固定値の確認用 */
  readonly readOnly?: boolean
  /** 入力 UI の種別。省略時はテキスト入力（ComboInput）。'checkbox' のとき truthy/falsy をチェックボックスで表示 */
  readonly inputType?: 'checkbox'
  /**
   * 専用ピッカーダイアログの種別。省略時は ComboInput。
   *   'org'      : 組織検索ダイアログ（departmentCode など組織コードを選ぶフィールドに付与）
   *   'position' : ポジション選択ダイアログ（managerPositionCode など positionCode を選ぶフィールドに付与）
   */
  readonly picker?: 'org' | 'position'
  /**
   * picker: 'position' のとき候補行を絞り込む述語。省略時は全ポジション行が候補。
   * カリー化により外側でコスト高な計算（配下列挙など）を1回だけ行い、内側を高速にする。
   */
  readonly positionFilter?: (row: AllocationRow, ctx: DomainContext) => (candidate: AllocationRow) => boolean
  /**
   * このフィールドの値が変更されたとき、操作固有のサイドエフェクトを返す。
   * - setValues       : 追加でセットするフィールド値（undefined = 空欄化）
   * - openPickerFor   : 自動的に開くピッカー対象フィールド
   * - openPickerInitialOrg : ピッカーを開く際の初期選択組織 ID
   *
   * deriveFieldUpdates（全操作共通）と共存する。afterChange の setValues が derived を上書きする。
   */
  readonly afterChange?: (value: string, ctx: DomainContext) => {
    setValues?:            Partial<AllocationRow>
    openPickerFor?:        keyof AllocationRow
    openPickerInitialOrg?: string
  }
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

  /** フォーム上部に表示する操作説明文。業務上の注意事項や手順を記載する */
  readonly description?: string

  /**
   * 保存時に追加で適用するフィールド計算。
   * - `undefined` を返したフィールドは空欄化
   * - 値を返したフィールドは自動導出として上書き（例: 上司ポジションコード変更→上司名を再導出）
   * UI はこの関数を事前呼び出しし、既存値が消えるフィールドがあれば確認ダイアログを表示する。
   */
  computeAfterFields?: (row: AllocationRow, ctx: DomainContext) => Partial<AllocationRow>

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

  /**
   * 確定時の EditCommand を生成する。
   * `row` と `ctx` は `computeAfterFields` を内部で呼ぶ def のみ使用する。
   * 既存 def はこれらを無視してよい。
   */
  createCommand(rowId: number, input: Partial<AllocationRow>, row?: AllocationRow, ctx?: DomainContext): EditCommand
}
