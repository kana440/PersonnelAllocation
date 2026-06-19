import type { AllocationRow }  from '../../allocationRow'
import type { AllCodeLists }   from '../../masters/aggregate'
import type { DomainContext, ValidationResult, OperationResult } from '../types'

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
   * この操作でのみ有効な選択肢リスト。
   * - 静的配列: コンパイル時確定の固定リスト。AI エクスポートにそのまま含まれる。
   * - 関数: DomainContext から動的に導出（コードリスト依存など）。
   * 省略時は FIELD_CONSTRAINTS から自動導出（全操作共通のデフォルト）。
   * 指定された場合は ComboInput を strict モードで表示し、リスト外の入力を抑止する。
   */
  readonly options?: readonly string[] | ((ctx: DomainContext) => readonly string[])

  /**
   * このフィールドの値が変更されたとき、操作固有のサイドエフェクトを返す。
   * - setValues          : 追加でセットするフィールド値（undefined = 空欄化）
   * - openPickerFor      : 自動的に開くピッカー対象フィールド
   * - openPickerInitialOrg: ピッカーを開く際の初期選択組織 ID
   * - suggestFieldValue  : 別フィールドへの値提案（UI が確認モーダルを表示）
   *
   * deriveFieldUpdates（全操作共通）と共存する。afterChange の setValues が derived を上書きする。
   */
  readonly afterChange?: (value: string, ctx: DomainContext) => {
    setValues?:            Partial<AllocationRow>
    openPickerFor?:        keyof AllocationRow
    openPickerInitialOrg?: string
    suggestFieldValue?:    { field: keyof AllocationRow; value: string }
  }
}

/**
 * 業務操作の統合定義。OperationDef（UI メタデータ）と EditCommand（ロジック）を統合した概念。
 *
 * - availableFor / inputs / deriveInitial: UI・AI 向けメタデータ
 * - validate / apply: ドメインロジック（DomainContext + rowId + values を受け取る純粋関数）
 *
 * bindOperation(op, rowId, values) で EditCommand（パラメータ束縛済み）に変換できる。
 * UI は apply() をドライランして inputs 外フィールドの変化を検出し、確認ダイアログを表示する。
 */
export interface EditOperation {
  /** 操作 ID */
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
   * true のとき apply() ドライランによる副作用警告を表示しない。
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
  deriveInitial(row: AllocationRow, ctx: DomainContext): Partial<AllocationRow>

  /** ユーザーが入力する必要があるフィールド（順序付き）。SectionDivider を挟むことでセクション区切りを定義できる */
  readonly inputs: (OperationInput | SectionDivider)[]

  /**
   * 現在の状態と入力値に対してバリデーションを実行する。
   * HRApplicationService.executeOperation() が apply() 前に呼ぶ。
   */
  validate(ctx: DomainContext, rowId: number, values: Partial<AllocationRow>): ValidationResult

  /**
   * バリデーション通過後、新しい状態を返す純粋関数。
   */
  apply(ctx: DomainContext, rowId: number, values: Partial<AllocationRow>): OperationResult
}

/** 後方互換エイリアス */
export type OperationDef = EditOperation
