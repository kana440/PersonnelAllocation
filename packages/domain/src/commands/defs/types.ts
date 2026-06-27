import type { AllocationRow }  from '../../allocationRow'
import type { AllMasters }   from '../../masters/aggregate'
import type { DomainContext, ValidationResult, OperationResult } from '../types'
import type { OperationBadge } from './badge'

/**
 * availableFor の戻り値型。
 * 利用可能なときは `{ available: true }`、不可のときは理由文字列を持つ。
 * UI tooltip・AI ツールのデバッグ情報に使用する。
 */
export type AvailabilityResult =
  | { available: true }
  | { available: false; reason: string }

/** availableFor で「利用可能」を返す定数 */
export const AVAILABLE: AvailabilityResult = { available: true }

/** availableFor で「利用不可 + 理由」を返すヘルパー */
export function unavailable(reason: string): AvailabilityResult {
  return { available: false, reason }
}

/**
 * 操作の概念グループ。UI でのメニュー分類・説明文に使用する。
 *   position        : ポジション操作（組織・上司・兼務など、席に関する変更）
 *   jobClassification    : 職務情報操作（バンド・役職・ジョブタイプなど、任用条件の変更）
 *   person              : 人操作（在籍状況・雇用形態・移籍など）
 *   secondmentMain      : 本務出向操作（出向・受入・解除）
 *   secondmentConcurrent: 兼務出向操作（出向・受入・解除）
 */
export type OperationGroup = 'position' | 'jobClassification' | 'person' | 'secondmentMain' | 'secondmentConcurrent'

/**
 * 操作の排他ロール宣言。行ごとの相互排他・取消ペアを宣言的に表現する。
 *
 *   lock        : この操作が行に適用されると「ロック状態」になり、他の normal/lock 操作を排他する。
 *                 afterConstraint で after フィールドの扱いを宣言できる:
 *                   'wipe'    : after フィールドを全てクリア（例: 変更なし・雇用延長）
 *                   'preserve': after フィールドを before からコピー（例: 将来の用途）
 *                   省略時    : after フィールドを自由に変更可
 *                 isActive/isActiveThisSession は UI・AI がロック状態を検出するための述語。
 *   lockCancel  : 指定した lock 操作のロール状態を取り消す操作。
 *                 of: キャンセル対象の lock 操作の id を指定する。
 *                 availableFor がセッション内取消条件、framework は isActiveThisSession を参照する。
 *   normal      : 排他制御に参加しない通常の操作（明示的に宣言する場合）。
 *                 lock が有効な行では自動的にブロックされる（将来の resolveAvailability で制御）。
 */
export type OperationRole =
  | {
      kind:               'lock'
      /** フレームワークは自動適用しない。onSubmit 内で preserve(row) を明示的に呼ぶこと */
      afterConstraint?:   'preserve'
      isActive(row: AllocationRow): boolean
      isActiveThisSession(row: AllocationRow): boolean
    }
  | { kind: 'lockCancel'; of: string }
  | { kind: 'normal' }

/**
 * inputs 配列内でセクション区切りを表す。フィールド定義と判別できる（kind プロパティで区別）。
 * 直前のフィールドと次のフィールドの間に見出し＋横線を描画する。
 */
export interface SectionDivider {
  readonly kind:  'section'
  readonly label: string
}

/** フィールド入力かセクション区切りかを判定するタイプガード */
export function isSectionDivider(i: OperationInput | SectionDivider | InputRow): i is SectionDivider {
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
  /** deriveFieldUpdates の結果からこのフィールドを除外する（自動導出させたくない場合） */
  excludeDerived?:       readonly (keyof AllocationRow)[]
}

/**
 * inputs 配列内で複数フィールドを横並びにするグループ。
 * 内部の OperationInput はすべて同一行に flex で配置される。
 * 現時点では readOnly フィールドのみを想定（組織サブフィールドの表示用）。
 */
export interface InputRow {
  readonly kind:   'row'
  readonly inputs: OperationInput[]
}

/** フィールド入力かセクション区切りか横並びグループかを判定するタイプガード */
export function isInputRow(i: OperationInput | SectionDivider | InputRow): i is InputRow {
  return (i as InputRow).kind === 'row'
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
   *   'org'             : 組織検索ダイアログ（departmentCode など組織コードを選ぶフィールドに付与）
   *   'position'        : ポジション選択ダイアログ（org ツリー＋ポジション一覧）
   *   'managerPosition' : 上司ポジション選択ダイアログ（人物検索 UI から positionCode を選ぶ）
   *                       フォームの departmentCode と同組織・親組織に絞り込み、横断トグルで全組織検索可。
   *                       選択時に positionCode とあわせて managerName を自動セット。
   *   'person'          : 人物検索ダイアログ（userId を選ぶフィールドに付与）
   *                       選択時に userId・lastName・firstName・groupEmployeeId・employeeNumber・employmentType を一括セット。
   *                       デフォルトはフォームの departmentCode と同組織・親組織に絞り込み、横断トグルで全組織検索可。
   */
  readonly picker?: 'org' | 'position' | 'managerPosition' | 'person' | 'newPosition'
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
   * optionsMode で選択肢の強制度を制御する（省略時は 'restrict'）。
   */
  readonly options?: readonly string[] | ((ctx: DomainContext, row?: AllocationRow) => readonly string[])
  /**
   * 選択肢の強制度。options が指定されている場合のみ有効。
   * - 'restrict'（デフォルト）: リスト外の入力を抑止する（strict モード）
   * - 'suggest': リストは推奨値として先頭に表示するが、自由入力も可能（guide モード）
   */
  readonly optionsMode?: 'restrict' | 'suggest'
  /**
   * フィールドに対して表示する動的な警告メッセージ。
   * 現在の入力値と他フィールドの状態を参照して警告を返す（undefined なら非表示）。
   * 例: 組織コード変更で勤務場所がマスタと不一致のとき。
   */
  readonly warningFn?: (ctx: DomainContext, values: Partial<AllocationRow>) => string | undefined
  /**
   * このフィールドを表示するかどうかを動的に決定する述語。
   * false を返すとフォームからこのフィールドが非表示になる。
   * values: 現在のフォーム入力値。masters: コードリスト（SF判定など用途）。
   * 省略時は常に表示。
   */
  readonly visibleWhen?: (values: Partial<AllocationRow>, masters: AllMasters) => boolean
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
   * true のとき、対象行に部下がいる場合に「元ポジションを空席として残す」チェックボックスを UI に表示する。
   * チェック ON のとき UI 側が withLeavePositionVacant(def) でラップして実行する。
   * ドラッグ（DragIntentPicker）と通常 Edit（OperationFormView）で共用。
   */
  readonly supportsLeaveVacant?: true

  /**
   * 排他ロール宣言。省略時は通常操作（normal 相当）として扱われる。
   * resolveAvailability() はこの宣言を参照して操作の相互排他を自動制御する（将来実装）。
   */
  readonly operationRole?: OperationRole

  /**
   * この操作が対象行に対してメニューに表示されるかどうか。
   * 不可の場合は reason で理由を返す（UI tooltip・AI ツールに利用）。
   */
  availableFor(row: AllocationRow, masters: AllMasters): AvailabilityResult

  /**
   * 操作選択時の初期フィールド値を計算する（プレビュー用・UndoStack 非対象）。
   */
  onOpen(row: AllocationRow, ctx: DomainContext): Partial<AllocationRow>

  /** ユーザーが入力する必要があるフィールド（順序付き）。SectionDivider でセクション区切り、InputRow で横並びグループを定義できる */
  readonly inputs: (OperationInput | SectionDivider | InputRow)[]

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
