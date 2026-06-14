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
  userId: string
  name: string
  orgName?: string
  rowIds: number[]
}

export interface PersonMatch {
  userId: string
  name: string
  currentOrgName?: string
  rowId: number
  currentGrade?: string
  currentPosition?: string
}

export interface PersonDiff {
  userId: string
  name: string
  orgName?: string
  rowId: number
  before: { grade?: string; position?: string; orgName?: string; note?: string }
  after:  { grade?: string; position?: string; orgName?: string; note?: string }
}

export interface OrgTreeNode {
  orgId: string
  orgName: string
  orgCode: string
  members: PersonInfo[]
  children: OrgTreeNode[]
}

export interface ReportLineMember {
  userId: string
  name: string
  orgName: string
  isSameOrg: boolean
  position?: string
  grade?: string
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
  | { type: 'org-input' }
  | { type: 'person-input' }
  | { type: 'org-members'; orgName: string; members: PersonInfo[] }
  | { type: 'promote-confirm'; persons: PersonMatch[] }
  | { type: 'org-tree'; orgName: string; tree: OrgTreeNode }
  | { type: 'report-line'; managerName: string; managerOrgName: string; members: ReportLineMember[] }
  | { type: 'diff-preview'; persons: PersonDiff[]; label?: string }
  | { type: 'impact-check'; targetOrgName: string; hasImpact: boolean; groups: Array<{ orgName: string; persons: PersonDiff[] }> }
  | { type: 'export-confirm'; changeCount: number; groups: Array<{ orgName: string; persons: PersonDiff[] }> }
  | { type: 'wizard-steps'; title: string; steps: WizardStep[] }
  | { type: 'teach-ai-input'; conversationWindow: ConversationItem[] }
  | { type: 'classification-result'; classified: ClassificationWidgetData }

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

export interface ConfirmResult {
  approved: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  widget?: ChatWidget
  isLoading?: boolean
  /** LLM が提案した確認ウィジェットの確定コールバック。設定時は WidgetCallbacks より優先される。 */
  llmConfirm?: () => void
  /** LLM が提案した確認ウィジェットのキャンセルコールバック。設定時は WidgetCallbacks より優先される。 */
  llmCancel?: () => void
}

export interface WidgetCallbacks {
  onFileSelected:      (file: File) => void
  onImportCancel:      () => void
  onOrgNameSubmit:     (name: string) => void
  onPersonNamesSubmit: (names: string) => void
  onPromoteConfirm:    () => void
  onPromoteCancel:     () => void
  onExportConfirm:     () => void
  onExportCancel:      () => void
  // AI feedback (Phase 1 — STEP1 active learning)
  onTeachAI?:               (messageId: string) => void
  onTeachAICancel?:         () => void
  onTeachAISubmit?:         (correction: string, window: ConversationItem[]) => void
  onClassificationApply?:   (classified: ClassificationWidgetData) => void
  onClassificationReject?:  (classifiedId: string) => void
}
