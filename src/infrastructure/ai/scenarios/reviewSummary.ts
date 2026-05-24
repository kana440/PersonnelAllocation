import { delay } from './delay'

const KIND_LABEL: Record<string, string> = {
  transfer:    '組織異動',
  promotion:   '昇格',
  demotion:    '降格',
  titleChange: '職位名変更',
  newHire:     '新規採用',
  termination: '退職',
  concurrent:  '兼務',
}

export interface ReviewSummaryResult {
  totalRows:    number
  changedRows:  number
  byKind:       Record<string, number>
  errorCount:   number
  warningCount: number
}

function buildSummaryText(summary: ReviewSummaryResult): string {
  const lines: string[] = [
    `全 ${summary.totalRows} 行のうち ${summary.changedRows} 行に変更があります。`,
  ]

  const kindEntries = Object.entries(summary.byKind)
    .sort((a, b) => b[1] - a[1])
  if (kindEntries.length > 0) {
    const kindText = kindEntries
      .map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}件`)
      .join('、')
    lines.push(`変更内訳: ${kindText}`)
  }

  if (summary.errorCount > 0 || summary.warningCount > 0) {
    const issueText = [
      summary.errorCount   > 0 ? `エラー ${summary.errorCount}件`      : '',
      summary.warningCount > 0 ? `警告 ${summary.warningCount}件` : '',
    ].filter(Boolean).join('、')
    lines.push(`検出された問題: ${issueText}（保存は可能です）`)
  } else {
    lines.push('バリデーション問題はありません。')
  }

  return lines.join('\n')
}

export const reviewSummaryScenario = {
  async summaryMessage(summary: ReviewSummaryResult): Promise<{ text: string; summary: ReviewSummaryResult }> {
    await delay(800)
    return { text: buildSummaryText(summary), summary }
  },

  async changedPersonsMessage(
    kindLabel: string,
    persons: Array<{ userId: string; name: string; orgName: string; kinds: string[] }>,
  ): Promise<{ text: string; persons: typeof persons }> {
    await delay(600)
    if (persons.length === 0) {
      return { text: `${kindLabel}に該当する変更はありません。`, persons: [] }
    }
    return {
      text: `${kindLabel}は ${persons.length} 件です。`,
      persons,
    }
  },

  async validationIssuesMessage(
    issues: Array<{ rowId: number; userId: string; name: string; field: string; level: string; message: string }>,
  ): Promise<{ text: string; issues: typeof issues }> {
    await delay(600)
    if (issues.length === 0) {
      return { text: 'バリデーション問題はありません。', issues: [] }
    }
    const errors   = issues.filter(i => i.level === 'error').length
    const warnings = issues.filter(i => i.level === 'warning').length
    const parts = [
      errors   > 0 ? `エラー ${errors}件`   : '',
      warnings > 0 ? `警告 ${warnings}件` : '',
    ].filter(Boolean).join('、')
    return {
      text: `${parts}が検出されました。保存・Excel出力は可能です。`,
      issues,
    }
  },
}
