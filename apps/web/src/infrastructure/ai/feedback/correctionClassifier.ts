import type { CorrectionCapture, ClassifiedCorrection, CorrectionKind, FeedbackLabel } from './types'

function makeId(): string {
  return `cls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function buildClassifierPrompt(
  capture: CorrectionCapture,
  toolDescriptions: Record<string, string>,
): string {
  const toolList = Object.entries(toolDescriptions)
    .map(([name, desc]) => `  - ${name}: ${desc}`)
    .join('\n')

  const conversation = capture.conversationWindow
    .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`)
    .join('\n\n')

  // 実行パス・スキル情報を補足コンテキストとして挿入
  const pathLines: string[] = []
  if (capture.agentPath) {
    pathLines.push(`**実行パス**: ${capture.agentPath === 'fast' ? 'Fast Path（読み取り・表示操作のみ）' : 'Structured Path（書き込み・確認操作あり）'}`)
  }
  if (capture.selectedSkills && capture.selectedSkills.length > 0) {
    pathLines.push(`**適用スキル**: ${capture.selectedSkills.join(', ')}`)
  }
  const pathContext = pathLines.length > 0
    ? `\n## 実行コンテキスト\n\n${pathLines.join('\n')}\n`
    : ''

  return `あなたはHR人事AIシステムのコーディネーターです。
HR専門家がAIシステムへ訂正を行いました。分析して分類と改善案を生成してください。

## 最近の会話

${conversation}

## 専門家の訂正内容

${capture.userCorrection}
${pathContext}
## 利用可能なツール一覧

${toolList || '（ツール情報なし）'}

## 分類基準（kind を1つ選択）

**tool_description_issue**: AIが誤ったツールを選んだ。ツール説明文を修正すれば解消できる。
→ proposedDescription を生成

**business_rule_gap**: AIが業務ルールを知らず誤った提案をした。コードは正しい。
→ ruleText（「〜の場合は〜する」形式、1〜2文）を生成

**workflow_pattern**: 複数ツールを特定順序で使うべき手順を知らなかった。
→ skillDraft（name・description・instructions・allowedTools）を生成

**tool_logic_bug**: ツールのデータや動作が期待と異なる。コード修正が必要。
→ codeFixDraft を生成

**missing_tool**: 求める操作を実行できるツールが存在しない。新規ツールが必要。
→ codeFixDraft を生成

## feedbackLabel（失敗の根本原因を1つ選択）

| ラベル | 説明 |
|---|---|
| intent_misread | ユーザーの意図を読み違えた |
| wrong_mode | Fast Path で処理すべき内容を Structured Path で処理した（またはその逆） |
| wrong_skill | Structured Path で不適切なスキルを選択した |
| missing_skill | 適切なスキルが登録されていなかった |
| wrong_tool | 適切なツールが存在するのに誤ったツールを呼んだ |
| over_confirmation | 確認なしで実行できたのに確認ウィジェットを出した |
| under_confirmation | 確認すべき操作で確認なしに進めた |
| bad_plan | 計画立案（ActionFrame）が誤っていた |
| bad_response | ツール呼び出しは正しかったが最終応答文が不適切 |
| tool_args_error | ツールの引数指定が誤っていた |

実行コンテキスト（Fast/Structured パス、適用スキル）を参考に feedbackLabel を判断してください。

## 出力（JSONのみ）

tool_description_issue:
{"kind":"tool_description_issue","confidence":0.9,"reasoning":"根拠","feedbackLabel":"wrong_tool","toolDescriptionDraft":{"targetTool":"ツール名","currentDescription":"現在の説明","proposedDescription":"改善後の説明"}}

business_rule_gap:
{"kind":"business_rule_gap","confidence":0.95,"reasoning":"根拠","feedbackLabel":"intent_misread","businessRuleDraft":{"ruleText":"ルール内容"}}

workflow_pattern:
{"kind":"workflow_pattern","confidence":0.88,"reasoning":"根拠","feedbackLabel":"missing_skill","skillDraft":{"slug":"kebab-slug","name":"スキル名","description":"使う場面","instructions":"# スキル名\\n\\n## 手順\\n1. ...","allowedTools":["tool1","tool2"]}}

tool_logic_bug / missing_tool:
{"kind":"tool_logic_bug","confidence":0.85,"reasoning":"根拠","feedbackLabel":"wrong_tool","codeFixDraft":{"title":"タイトル","description":"詳細","expectedBehavior":"期待動作","targetTool":"関連ツール名"}}
`
}

const VALID_FEEDBACK_LABELS = new Set<FeedbackLabel>([
  'intent_misread', 'wrong_mode', 'wrong_skill', 'missing_skill', 'wrong_tool',
  'over_confirmation', 'under_confirmation', 'bad_plan', 'bad_response', 'tool_args_error',
])

function isFeedbackLabel(v: unknown): v is FeedbackLabel {
  return typeof v === 'string' && VALID_FEEDBACK_LABELS.has(v as FeedbackLabel)
}

interface RawParsed {
  kind: CorrectionKind
  confidence: number
  reasoning: string
  feedbackLabel?: string
  toolDescriptionDraft?: { targetTool: string; currentDescription: string; proposedDescription: string }
  businessRuleDraft?: { ruleText: string }
  skillDraft?: { slug: string; name: string; description: string; instructions: string; allowedTools: string[] }
  codeFixDraft?: { title: string; description: string; expectedBehavior: string; targetTool?: string }
}

export function parseClassifierOutput(
  captureId: string,
  content: string,
): ClassifiedCorrection | null {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null

    const parsed = JSON.parse(match[0]) as RawParsed
    if (!parsed.kind || !parsed.reasoning) return null

    return {
      id:                   makeId(),
      captureId,
      kind:                 parsed.kind,
      confidence:           typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning:            parsed.reasoning,
      feedbackLabel:        isFeedbackLabel(parsed.feedbackLabel) ? parsed.feedbackLabel : undefined,
      toolDescriptionDraft: parsed.toolDescriptionDraft,
      businessRuleDraft:    parsed.businessRuleDraft,
      skillDraft:           parsed.skillDraft,
      codeFixDraft:         parsed.codeFixDraft,
      status:               'pending',
      createdAt:            Date.now(),
    }
  } catch {
    return null
  }
}
