import type {
  BandOption,
  Company,
  Organization,
  Person,
  Position,
  Affiliation,
  Operation,
} from '../domain/schemas'
import type { AllCodeLists } from '../domain/codeLists/aggregate'

// ── 読み取り専用マスタ ────────────────────────────────────────
// SF では picklist values / カスタムオブジェクト から取得
// Excel では専用シートから取得
export interface IMasterRepository {
  getBands(): Promise<BandOption[]>
  getTransferReasons(): Promise<string[]>
  getPositionTitles(): Promise<string[]>
}

// ── コードリスト（参照テーブル）───────────────────────────────
// IN専用（書き込みはセットアップフローが担う）。
// 差し替え実装例: LocalStorageCodeListRepository / ApiCodeListRepository / SFPicklistRepository
export interface ICodeListSource {
  load(): Promise<AllCodeLists | null>
}

// ── エンティティ ─────────────────────────────────────────────
export interface ICompanyRepository {
  getAll(): Promise<Company[]>
}

export interface IOrganizationRepository {
  getAll(): Promise<Organization[]>
  getByCompany(companyId: string): Promise<Organization[]>
}

export interface IPersonRepository {
  getAll(): Promise<Person[]>
  getById(id: string): Promise<Person | null>
}

// 発令前の状態（Before）を提供する
export interface IPositionRepository {
  getAll(): Promise<Position[]>
}

export interface IAffiliationRepository {
  getAll(): Promise<Affiliation[]>
}

// 操作履歴（発令手順）の永続化
// 将来: SF カスタムオブジェクトへ保存
export interface IOperationRepository {
  getAll(): Promise<Operation[]>
  save(op: Operation): Promise<void>
  delete(id: string): Promise<void>
}

// ── コンテナ（全リポジトリの集合体）─────────────────────────
export interface Repositories {
  masters:       IMasterRepository
  companies:     ICompanyRepository
  organizations: IOrganizationRepository
  persons:       IPersonRepository
  positions:     IPositionRepository
  affiliations:  IAffiliationRepository
  operations:    IOperationRepository
  codeLists:     ICodeListSource
}
