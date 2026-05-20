import type { PatternDetectionResult, AIPatternSuggestion } from '../operationPatterns/types'
import type { Organization } from '../../types/domain'

// AI パターン提案ポート（Domain が依存する抽象）
// 実装: infrastructure/mockPatternAdvisor.ts（現行）/ claudePatternAdvisor.ts（将来）
export interface IAIPatternAdvisor {
  suggest(
    detection: PatternDetectionResult,
    context:   { organizations: Organization[] }
  ): Promise<AIPatternSuggestion | null>
}
