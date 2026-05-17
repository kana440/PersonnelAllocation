// AllCodeLists — domain-level aggregate of all reference/master code lists.
// Belongs in the domain layer because it defines valid value sets for domain fields.
import type { CompanyFilterEntry }  from './companyFilter'
import type { EmploymentTypeEntry } from './employmentType'
import type { PayGradeEntry }       from './payGrade'
import type { OfficialPositionEntry } from './officialPosition'
import type { WorkLocationEntry }   from './workLocation'
import type { JobFamilyEntry, SubJobFamilyEntry } from './jobFamily'
import type { JobLevelEntry }       from './jobLevel'
import type { TransferReasonEntry } from './transferReason'
import type { ConcurrentReasonEntry } from './concurrentReason'
import type { DemotionReasonEntry } from './demotionReason'
import type { OrgMasterEntry }      from './orgMaster'

export interface AllCodeLists {
  // 組織マスタ
  orgMasterEntries:         OrgMasterEntry[]

  // 会社・フィルタ
  companyFilters:           CompanyFilterEntry[]

  // 雇用・給与
  employmentTypes:          EmploymentTypeEntry[]
  payGrades:                PayGradeEntry[]

  // 役職・組織
  officialPositions:        OfficialPositionEntry[]
  workLocations:            WorkLocationEntry[]

  // 職務分類（親子）
  jobFamilies:              JobFamilyEntry[]    // 職種テーブル (AM-AN) が source
  subJobFamilies:           SubJobFamilyEntry[]

  // 職務レベル
  jobLevels:                JobLevelEntry[]

  // 異動・事由
  transferReasons:          TransferReasonEntry[]
  concurrentReasons:        ConcurrentReasonEntry[]
  demotionReasons:          DemotionReasonEntry[]

  // フォーム選択肢（純粋リスト）
  trainingPositions:        string[]   // 業務研修ポジション (BI)
  discretionaryWorkOptions: string[]   // 裁量労働／業務研修 (BM)
}

export const EMPTY_CODE_LISTS: AllCodeLists = {
  orgMasterEntries:         [],
  companyFilters:           [],
  employmentTypes:          [],
  payGrades:                [],
  officialPositions:        [],
  workLocations:            [],
  jobFamilies:              [],
  subJobFamilies:           [],
  jobLevels:                [],
  transferReasons:          [],
  concurrentReasons:        [],
  demotionReasons:          [],
  trainingPositions:        [],
  discretionaryWorkOptions: [],
}
