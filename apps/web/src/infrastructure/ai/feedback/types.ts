export type CorrectionKind =
  | 'tool_description_issue'
  | 'business_rule_gap'
  | 'workflow_pattern'
  | 'tool_logic_bug'
  | 'missing_tool'

/**
 * AIの挙動に対するフィードバックのラベル。
 * wrong_mode が多い → Fast/Structured 分岐条件を改善
 * wrong_skill が多い → Skill の description / when-to-use を改善
 * over_confirmation が多い → confirm ツールの閾値が厳しすぎ
 * under_confirmation が多い → confirm ツールの閾値が甘すぎ
 * tool_args_error が多い → Tool schema を厳密化
 */
export type FeedbackLabel =
  | 'intent_misread'        // ユーザーの意図を読み違えた
  | 'wrong_mode'            // Fast/Structured の分岐が間違っていた
  | 'wrong_skill'           // 間違ったスキルを選択した
  | 'missing_skill'         // 適切なスキルがなかった
  | 'wrong_tool'            // 間違ったツールを呼んだ
  | 'over_confirmation'     // 不要な確認を求めた
  | 'under_confirmation'    // 確認なしに実行すべきでない操作を実行した
  | 'bad_plan'              // 手順の計画が間違っていた
  | 'bad_response'          // 回答の質が低かった
  | 'tool_args_error'       // ツールの引数が間違っていた

export interface CorrectionCapture {
  id: string
  sessionId: string
  trigger: 'explicit' | 'auto'
  conversationWindow: Array<{ role: 'user' | 'assistant'; content: string }>
  userCorrection: string
  createdAt: number
  /** どのパスで実行されたか（ログから引き継ぐ） */
  agentPath?: 'fast' | 'structured'
  /** 使用されたスキルの slug リスト */
  selectedSkills?: string[]
}

export interface ClassifiedCorrection {
  id: string
  captureId: string
  kind: CorrectionKind
  confidence: number
  reasoning: string
  /** 分類から推定されるフィードバックラベル */
  feedbackLabel?: FeedbackLabel
  toolDescriptionDraft?: {
    targetTool: string
    currentDescription: string
    proposedDescription: string
  }
  businessRuleDraft?: {
    ruleText: string
  }
  skillDraft?: {
    slug: string
    name: string
    description: string
    instructions: string
    allowedTools: string[]
  }
  codeFixDraft?: {
    title: string
    description: string
    expectedBehavior: string
    targetTool?: string
  }
  status: 'pending' | 'applied' | 'rejected'
  createdAt: number
}

export interface AiAppliedRule {
  id: string
  kind: 'tool_description' | 'learned_rule' | 'skill'
  targetKey: string  // skill の場合は slug
  prevContent?: string
  newContent: string
  appliedAt: number
  isActive: boolean
  basedOnProposedId: string
}

export interface AiCodeFixRequest {
  id: string
  classification: 'tool_logic_bug' | 'missing_tool'
  targetKey?: string
  title: string
  description: string
  expectedBehavior: string
  exampleInputs: object[]
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: number
}

/** 1ターンの実行ログ。フィードバック改善の分析に使う。 */
export interface AgentRunLog {
  id: string
  sessionId: string
  userMessage: string
  /** Fast Path で完結したか、Structured Path に移行したか */
  path: 'fast' | 'structured'
  /** Structured Path で選択されたスキルの slug */
  selectedSkills?: string[]
  /** このターンで呼ばれたツール名の一覧（request_structured_planning を含む） */
  toolCallNames?: string[]
  finalResponse: string
  createdAt: number
  /** ユーザーが付与したフィードバックラベル */
  feedbackLabel?: FeedbackLabel
  feedbackNote?: string
}
