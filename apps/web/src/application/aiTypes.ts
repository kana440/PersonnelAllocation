export type CorrectionKind =
  | 'tool_description_issue'
  | 'business_rule_gap'
  | 'workflow_pattern'
  | 'tool_logic_bug'
  | 'missing_tool'

/** Classification result payload stored in the chat widget (mirrored from feedback/types.ts) */
export interface ClassificationWidgetData {
  id: string
  captureId: string
  kind: CorrectionKind
  confidence: number
  reasoning: string
  toolDescriptionDraft?: { targetTool: string; currentDescription: string; proposedDescription: string }
  businessRuleDraft?: { ruleText: string }
  skillDraft?: { slug: string; name: string; description: string; instructions: string; allowedTools: string[] }
  codeFixDraft?: { title: string; description: string; expectedBehavior: string; targetTool?: string }
  status: 'pending' | 'applied' | 'rejected'
}

export type ConversationItem = { role: 'user' | 'assistant'; content: string }

export interface PersonInfo {
  userId?: string
  name: string
  orgName?: string
  rowIds: number[]
}

export interface PersonDiff {
  userId: string
  name: string
  orgName?: string
  rowId: number
  before: { grade?: string; position?: string; orgName?: string; note?: string }
  after:  { grade?: string; position?: string; orgName?: string; note?: string }
  /** 連動変更フィールド一覧。execute 後の副次変更の可視化に使う。 */
  fields?: Array<{ label: string; before?: string; after?: string }>
}

export interface OrgTreeNode {
  orgId: string
  orgName: string
  orgCode: string
  members: PersonInfo[]
  children: OrgTreeNode[]
}

export interface WizardStep {
  stepNumber:  number
  title:       string
  description?: string
  diffs:       PersonDiff[]
}

export type ChatWidget =
  | { type: 'file-picker' }
  | { type: 'excel-help' }
  | { type: 'org-members'; orgName: string; members: PersonInfo[] }
  | { type: 'org-tree'; orgName: string; tree: OrgTreeNode }
  | { type: 'diff-preview'; persons: PersonDiff[]; label?: string }
  | { type: 'export-confirm'; changeCount: number; groups: Array<{ orgName: string; persons: PersonDiff[] }> }
  | { type: 'wizard-steps'; title: string; steps: WizardStep[] }
  | { type: 'teach-ai-input'; conversationWindow: ConversationItem[] }
  | { type: 'classification-result'; classified: ClassificationWidgetData }
  /** 昇格確認 — 対話型バンド選択・連鎖導出・DryRun表示 */
  | { type: 'promotion-confirm'
      rowId: number
      proposedPositionBand: string
      proposedOfficialPositionCode?: string
      proposedLocalJobTitle?: string
      label?: string }
  /** 降格確認 — 昇格と同じ構成＋降格理由必須 */
  | { type: 'demotion-confirm'
      rowId: number
      proposedPositionBand: string
      proposedOfficialPositionCode?: string
      proposedLocalJobTitle?: string
      demotionReason?: string
      label?: string }
  /** 組織異動確認 — 対象者一覧 + 異動事由入力 */
  | { type: 'org-transfer-confirm'
      persons: PersonDiff[]
      targetOrgName: string
      transferReason?: string
      label?: string }
  /** 出向受入確認（本務）— SF統合先 / SF非統合先 variant */
  | { type: 'secondment-in-confirm'
      rowId: number
      sfIntegrated: boolean
      label?: string }
  /** 兼務出向受入確認 — SF統合先 / SF非統合先 variant */
  | { type: 'concurrent-secondment-in-confirm'
      rowId: number
      sfIntegrated: boolean
      label?: string }

/** 選択中の行のコンテキスト情報。AI のシステムプロンプトに注入する */
export interface SelectedRowContext {
  rowId:        number
  userId?:      string
  name:         string
  orgName:      string
  orgCode?:     string
  issues:       Array<{ field: string; level: 'error' | 'warning'; message: string }>
  changeKinds:  string[]
  availableOps: string[]
  keyFields: {
    employmentType?:      string
    band?:                string
    payGrade?:            string
    officialPositionCode?:string
    leaveOfAbsenceSign?:  string
    concurrentType?:      string
    positionCode?:        string
  }
}

/** confirm ツールの確認UIに表示する入力フォームの1フィールド */
export interface FormInput {
  field:      string      // フィールドキー（usedValues のキーになる）
  label:      string      // 表示名
  value?:     string      // AI が提案した初期値（空なら未入力）
  required:   boolean
  options?:   string[]    // 選択肢がある場合
  readOnly?:  boolean     // 表示のみ（変更不可）
  prevValue?: string      // Excel インポート時の before 値。存在する場合「変更前: xxx」警告を表示
}

/** confirm ツールの承認/却下結果。ユーザーが formInputs に入力した値も含む */
export interface ConfirmResult {
  approved:    boolean
  userInputs?: Record<string, string>  // ユーザーが確認・上書きした formInputs の値
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  widget?: ChatWidget
  isLoading?: boolean
  /** confirm ツールが buildProposal で返した入力フォーム定義。専用 Widget が使わないシンプルな操作のみ使用。 */
  formInputs?: FormInput[]
  /** LLM が提案した確認ウィジェットの確定コールバック。userInputs はユーザーが編集した値。設定時は WidgetCallbacks より優先される。 */
  llmConfirm?: (userInputs?: Record<string, string>) => void
  /** LLM が提案した確認ウィジェットのキャンセルコールバック。設定時は WidgetCallbacks より優先される。 */
  llmCancel?: () => void
}

export interface WidgetCallbacks {
  onFileSelected:   (file: File) => void
  onImportCancel:   () => void
  onExportConfirm:  () => void
  onExportCancel:   () => void
  // AI feedback (Phase 1 — STEP1 active learning)
  onTeachAI?:               (messageId: string) => void
  onTeachAICancel?:         () => void
  onTeachAISubmit?:         (correction: string, window: ConversationItem[]) => void
  onClassificationApply?:   (classified: ClassificationWidgetData) => void
  onClassificationReject?:  (classifiedId: string) => void
}
