import type { Repositories } from '../ports'
import type {
  Person, Company, Organization, Position, Affiliation, Operation, BandOption,
} from '../domain/schemas'
import { applyOperations } from '../domain/applyOperations'
import type { AfterState } from '../domain/applyOperations'
import { operationRegistry } from '../domain/operations'

// ── ドメインスナップショット ─────────────────────────────────────
// Zustand・AIどちらもこの型で状態を受け取る
export interface DomainSnapshot {
  persons:            Person[]
  companies:          Company[]
  organizations:      Organization[]
  beforePositions:    Position[]
  beforeAffiliations: Affiliation[]
  operations:         Operation[]
  afterPositions:     Position[]
  afterAffiliations:  Affiliation[]
  afterOrganizations: Organization[]
  bands:              BandOption[]
  transferReasons:    string[]
  positionTitles:     string[]
}

// ── HRApplicationService ─────────────────────────────────────────
// Source of Truth。業務状態とロジックをここに集約する。
// Zustand（UI表示）・AIアダプター（推論・シミュレーション）の両方から参照する。
export class HRApplicationService {
  private persons:            Person[]       = []
  private companies:          Company[]      = []
  private organizations:      Organization[] = []
  private beforePositions:    Position[]     = []
  private beforeAffiliations: Affiliation[]  = []
  private operations:         Operation[]    = []
  private bands:              BandOption[]   = []
  private transferReasons:    string[]       = []
  private positionTitles:     string[]       = []

  private listeners = new Set<() => void>()

  // ── 変更通知 ────────────────────────────────────────────────────
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.listeners.forEach(fn => fn())
  }

  // ── スナップショット取得 ─────────────────────────────────────────
  // afterState は毎回 operations から計算する（キャッシュ不要なレベルの規模）
  getSnapshot(): DomainSnapshot {
    const after = applyOperations(
      this.beforeAffiliations, this.beforePositions,
      this.operations, this.organizations,
    )
    return {
      persons:            this.persons,
      companies:          this.companies,
      organizations:      this.organizations,
      beforePositions:    this.beforePositions,
      beforeAffiliations: this.beforeAffiliations,
      operations:         this.operations,
      afterPositions:     after.positions,
      afterAffiliations:  after.affiliations,
      afterOrganizations: after.organizations,
      bands:              this.bands,
      transferReasons:    this.transferReasons,
      positionTitles:     this.positionTitles,
    }
  }

  // ── 初期化（リポジトリから全データを取得）──────────────────────
  async initialize(repos: Repositories): Promise<void> {
    const [
      persons, companies, organizations,
      positions, affiliations, operations,
      bands, transferReasons, positionTitles,
    ] = await Promise.all([
      repos.persons.getAll(),
      repos.companies.getAll(),
      repos.organizations.getAll(),
      repos.positions.getAll(),
      repos.affiliations.getAll(),
      repos.operations.getAll(),
      repos.masters.getBands(),
      repos.masters.getTransferReasons(),
      repos.masters.getPositionTitles(),
    ])

    this.persons            = persons
    this.companies          = companies
    this.organizations      = organizations
    this.beforePositions    = positions
    this.beforeAffiliations = affiliations
    this.operations         = operations
    this.bands              = bands
    this.transferReasons    = transferReasons
    this.positionTitles     = positionTitles

    this.emit()
  }

  // ── 手順追加（重複・相殺ルールはハンドラーの preAdd に委譲）────
  addOperation(op: Omit<Operation, 'id' | 'order'>): void {
    const handler = operationRegistry.get(op.kind)
    const result  = handler?.preAdd?.(this.operations, op)

    if (result === null) {
      // 相殺：対になる既存操作を除去して新規追加はしない
      const paired = this.operations.find(o => handler?.preAdd?.([o], op) === null)
      this.operations = this.operations
        .filter(o => o !== paired)
        .map((o, i) => ({ ...o, order: i + 1 }))
      this.emit()
      return
    }

    const ops   = result ?? this.operations
    const newOp: Operation = { ...op, id: `op_${Date.now()}`, order: ops.length + 1 }
    this.operations = [...ops, newOp].map((o, i) => ({ ...o, order: i + 1 }))
    this.emit()
  }

  // ── 手順削除 ────────────────────────────────────────────────────
  removeOperation(id: string): void {
    this.operations = this.operations
      .filter(o => o.id !== id)
      .map((o, i) => ({ ...o, order: i + 1 }))
    this.emit()
  }

  // ── シミュレーション（副作用なし）──────────────────────────────
  // AI が「この手順を追加したらどうなるか」を計算するために使う
  simulate(op: Omit<Operation, 'id' | 'order'>): AfterState {
    const tempOp: Operation = { ...op, id: `temp_${Date.now()}`, order: this.operations.length + 1 }
    return applyOperations(
      this.beforeAffiliations, this.beforePositions,
      [...this.operations, tempOp], this.organizations,
    )
  }

  // ── Excelインポート時などに使う状態リセット ──────────────────────
  loadBaseState(data: {
    persons:       Person[]
    companies:     Company[]
    organizations: Organization[]
    affiliations:  Affiliation[]
    positions:     Position[]
  }): void {
    this.persons            = data.persons
    this.companies          = data.companies
    this.organizations      = data.organizations
    this.beforeAffiliations = data.affiliations
    this.beforePositions    = data.positions
    this.operations         = []
    this.emit()
  }
}

// モジュールスコープのシングルトン
// テスト時は new HRApplicationService() で独立したインスタンスを生成できる
export const appService = new HRApplicationService()
