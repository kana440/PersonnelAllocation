// AllMasters — domain-level aggregate of all reference/master code lists.
// Belongs in the domain layer because it defines valid value sets for domain fields.
import type { CompanyEntry }        from './company'
import type { CompanyFilterEntry }  from './companyFilter'
import type { EmploymentTypeEntry } from './employmentType'
import type { PayGradeEntry }       from './payGrade'
import type { OfficialPositionEntry } from './officialPosition'
import type { WorkLocationEntry }   from './workLocation'
import type { JobFamilyEntry }  from './jobFamily'
import type { JobTypeEntry }    from './jobType'
import type { JobLevelEntry }       from './jobLevel'
import type { TransferReasonEntry } from './transferReason'
import type { ConcurrentReasonEntry } from './concurrentReason'
import type { DemotionReasonEntry } from './demotionReason'
import type { OrgMasterEntry }      from './orgMaster'
import type { TrainingPositionEntry }  from './trainingPosition'
import type { DiscretionaryWorkEntry } from './discretionaryWork'
import type { PromotionMatrixEntry }  from './promotionMatrix'

export interface AllMasters {
  // 組織マスタ
  orgMasterEntries:         OrgMasterEntry[]

  // 会社
  companies:                CompanyEntry[]
  companyFilters:           CompanyFilterEntry[]

  // 雇用・給与
  employmentTypes:          EmploymentTypeEntry[]
  payGrades:                PayGradeEntry[]

  // 役職・組織
  officialPositions:        OfficialPositionEntry[]
  workLocations:            WorkLocationEntry[]

  // 職務分類（親子）
  jobFamilies:              JobFamilyEntry[]    // 職種テーブル (AM-AN) が source
  jobTypes:           JobTypeEntry[]

  // 職務レベル
  jobLevels:                JobLevelEntry[]

  // 異動・事由
  transferReasons:          TransferReasonEntry[]
  concurrentReasons:        ConcurrentReasonEntry[]
  demotionReasons:          DemotionReasonEntry[]

  // フォーム選択肢（純粋リスト）
  trainingPositions:        TrainingPositionEntry[]   // 業務研修ポジション (BI)
  discretionaryWorkOptions: DiscretionaryWorkEntry[]  // 裁量労働／業務研修 (BM)

  // 昇降格マトリクス（職務レベル × 役職 × M職P職）
  promotionMatrix:          PromotionMatrixEntry[]    // 昇降格段階チェック (BT-BW)
  /** M職P職切替用マトリクス (BX-CA)。未設定時は promotionMatrix にフォールバック */
  mpSwitchMatrix:           PromotionMatrixEntry[]
}

export const EMPTY_MASTERS: AllMasters = {
  orgMasterEntries:         [],
  companies:                [],
  companyFilters:           [],
  employmentTypes:          [],
  payGrades:                [],
  officialPositions:        [],
  workLocations:            [],
  jobFamilies:              [],
  jobTypes:           [],
  jobLevels:                [],
  transferReasons:          [],
  concurrentReasons:        [],
  demotionReasons:          [],
  trainingPositions:        [],
  discretionaryWorkOptions: [],
  promotionMatrix:          [],
  mpSwitchMatrix:           [],
}
