export type CorrectionKind =
  | 'tool_description_issue'
  | 'business_rule_gap'
  | 'workflow_pattern'
  | 'tool_logic_bug'
  | 'missing_tool'

export interface CorrectionCapture {
  id: string
  sessionId: string
  trigger: 'explicit' | 'auto'
  conversationWindow: Array<{ role: 'user' | 'assistant'; content: string }>
  userCorrection: string
  createdAt: number
}

export interface ClassifiedCorrection {
  id: string
  captureId: string
  kind: CorrectionKind
  confidence: number
  reasoning: string
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
