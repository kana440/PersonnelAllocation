import type { AllocationRow }  from '../../allocationRow'
import type { AllCodeLists }   from '../../masters/aggregate'
import type { DomainContext, ValidationResult, OperationResult } from '../types'
import type { OperationBadge } from './badge'

/**
 * 操作の概念グループ。UI でのメニュー分類・説明文に使用する。
 *   position        : ポジション操作（組織・上司・兼務など、席に関する変更）
 *   jobClassification: 職務情報操作（バンド・役職・ジョブタイプなど、任用条件の変更）
 *   person          : 人操作（在籍状況・雇用形態・出向・移籍など）
 */
export type OperationGroup = 'position' | 'jobClassification' | 'person'

/**
 * inputs 配列内でセクション区切りを表す。フィールド定義と判別できる（kind プロパティで区別）。
 * 直前のフィールドと次のフィールドの間に見出し＋横線を描画する。
 */
export interface SectionDivider {
  readonly kind:  'section'
  readonly label: string
}

/** フィールド入力かセクション区切りかを判定するタイプガード */
export function isSectionDivider(i: OperationInput | SectionDivider): i is SectionDivider {
  return (i as SectionDivider).kind === 'section'
}

/**
 * フィールド変更時のサイドエフェクト型。
 * onFieldChange ハンドラと onOpen 由来の値設定に使用する。
 */
export type FieldChangeEffect = {
  setValues?:            Partial<AllocationRow>
  openPickerFor?:        keyof AllocationRow
  openPickerInitialOrg?: string
  suggestFieldValue?:    { field: keyof AllocationRow; value: string }
  suppressDerive?:       boolean   // true のとき deriveFieldUpdates をスキップ
}

/**
 * 操作の入力フィールド定義。
 * UI フォームでユーザーが入力する必要があるフィールドを宣言する。
 */
export interface OperationInput {
  readonly field:    keyof AllocationRow
  readonly required: boolean
  /** ラベル上書き。省略時は ALLOCATION_LIST_LABEL_MAP から取得（_新 サフィックスは自動除去）*/
  readonly label?:   string
  /**
   * true のとき、フォーム本体ではなくヘッダー右側のインジケーターエリアに表示される。
   * 自動導出されるサインフラグ（readOnly + inputType: 'checkbox'）に使用する。
   */
  readonly indicator?: boolean
  /**
   * バンド選択肢を方向でフィルタリングする。
   * 'up' = 現在より上のバンドのみ（昇格用）、'down' = 下のみ（降格用）。
   * UI 側でステップ数セレクター（1段階/2段階/全て）と組み合わせて使用する。
   */
  readonly stepFilter?: 'up' | 'down'
  /** true のとき値を表示するが編集不可にする。onOpen で設定した固定値の確認用 */
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
   * この操作でのみ有効な選択肢リスト。
   * - 静的配列: コンパイル時確定の固定リスト。AI エクスポートにそのまま含まれる。
   * - 関数: DomainContext から動的に導出（コードリスト依存など）。
   * 省略時は FIELD_CONSTRAINTS から自動導出（全操作共通のデフォルト）。
   * 指定された場合は ComboInput を strict モードで表示し、リスト外の入力を抑止する。
   */
  readonly options?: readonly string[] | ((ctx: DomainContext) => readonly string[])
}

/**
 * 業務操作の統合定義。OperationDef（UI メタデータ）と EditCommand（ロジック）を統合した概念。
 *
 * - availableFor / inputs / onOpen: UI・AI 向けメタデータ
 * - onValidate / onSubmit: ドメインロジック（DomainContext + rowId + values を受け取る純粋関数）
 *
 * bindOperation(op, rowId, values) で EditCommand（パラメータ束縛済み）に変換できる。
 * UI は onSubmit() をドライランして inputs 外フィールドの変化を検出し、確認ダイアログを表示する。
 */
export interface EditOperation {
  /** 操作 ID */
  readonly id:         string
  /** UI 表示名 */
  readonly label:      string
  /** 概念グループ */
  readonly group:      OperationGroup
  /** バッジの意味分類（UI 側でこの値から色を導出する） */
  readonly badge: OperationBadge

  /** フォーム上部に表示する操作説明文。業務上の注意事項や手順を記載する */
  readonly description?: string

  /**
   * true のとき onSubmit() ドライランによる副作用警告を表示しない。
   * 昇格サイン等の自動付与など、副作用が操作名から自明な場合に設定する。
   */
  readonly suppressSideEffectWarning?: boolean

  /**
   * この操作が対象行に対してメニューに表示されるかどうか。
   */
  availableFor(row: AllocationRow, codeLists: AllCodeLists): boolean

  /**
   * 操作選択時の初期フィールド値を計算する（プレビュー用・UndoStack 非対象）。
   */
  onOpen(row: AllocationRow, ctx: DomainContext): Partial<AllocationRow>

  /** ユーザーが入力する必要があるフィールド（順序付き）。SectionDivider を挟むことでセクション区切りを定義できる */
  readonly inputs: (OperationInput | SectionDivider)[]

  /**
   * フィールド変更時の操作固有サイドエフェクト。
   * deriveFieldUpdates（全操作共通）が先に動いた後、このマップのハンドラが実行される。
   * setValues は deriveFieldUpdates の結果を上書きする。
   */
  readonly onFieldChange?: Partial<Record<keyof AllocationRow, (value: string, ctx: DomainContext) => FieldChangeEffect>>

  /**
   * 現在の状態と入力値に対してバリデーションを実行する。
   * HRApplicationService.executeOperation() が onSubmit() 前に呼ぶ。
   */
  onValidate(ctx: DomainContext, rowId: number, values: Partial<AllocationRow>): ValidationResult

  /**
   * バリデーション通過後、新しい状態を返す純粋関数。
   */
  onSubmit(ctx: DomainContext, rowId: number, values: Partial<AllocationRow>): OperationResult
}

/** 後方互換エイリアス */
export type OperationDef = EditOperation
