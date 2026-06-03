// 会社CD一覧 — AllocationList.secondmentFromCompany / 出向元会社
import type { CodeEntry } from './types'

export interface CompanyEntry extends CodeEntry {
  isDiscretionaryTarget: boolean    // 裁量対象サイン
  isSFIntegrated?:       boolean    // SF（SuccessFactors）統合済み会社かどうか（ユーザー指定）
}
