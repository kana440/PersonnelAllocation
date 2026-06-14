import type { CorrectionCapture, ClassifiedCorrection, CorrectionKind } from './types'

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

  return `あなたはHR人事AIシステムのコーディネーターです。
HR専門家がAIシステムへ訂正を行いました。分析して分類と改善案を生成してください。

## 最近の会話

${conversation}

## 専門家の訂正内容

${capture.userCorrection}

## 利用可能なツール一覧

${toolList || '（ツール情報なし）'}

## 分類基準（1つ選択）

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

## 出力（JSONのみ）

tool_description_issue:
{"kind":"tool_description_issue","confidence":0.9,"reasoning":"根拠","toolDescriptionDraft":{"targetTool":"ツール名","currentDescription":"現在の説明","proposedDescription":"改善後の説明"}}

business_rule_gap:
{"kind":"business_rule_gap","confidence":0.95,"reasoning":"根拠","businessRuleDraft":{"ruleText":"ルール内容"}}

workflow_pattern:
{"kind":"workflow_pattern","confidence":0.88,"reasoning":"根拠","skillDraft":{"slug":"kebab-slug","name":"スキル名","description":"使う場面","instructions":"# スキル名\\n\\n## 手順\\n1. ...","allowedTools":["tool1","tool2"]}}

tool_logic_bug / missing_tool:
{"kind":"tool_logic_bug","confidence":0.85,"reasoning":"根拠","codeFixDraft":{"title":"タイトル","description":"詳細","expectedBehavior":"期待動作","targetTool":"関連ツール名"}}
`
}

interface RawParsed {
  kind: CorrectionKind
  confidence: number
  reasoning: string
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
