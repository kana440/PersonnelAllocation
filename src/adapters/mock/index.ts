/**
 * Mock adapters — all port interfaces implemented against in-memory data.
 * Each adapter runs Zod validation at parse time so bad mock data fails loudly.
 * To add a new adapter (Excel / Salesforce), implement the same port interfaces.
 */
import {
  BandOptionSchema,
  type BandOption,
  type Company,
  type Organization,
  type Person,
  type Position,
  type Affiliation,
  type Operation,
} from '../../domain/schemas'
import type {
  IMasterRepository,
  ICompanyRepository,
  IOrganizationRepository,
  IPersonRepository,
  IPositionRepository,
  IAffiliationRepository,
  IOperationRepository,
} from '../../ports'

// ── Master ─────────────────────────────────────────────────────
const RAW_BANDS: BandOption[] = [
  { id: 'B1', label: 'B1', grade: '1等級', sortOrder: 1 },
  { id: 'B2', label: 'B2', grade: '2等級', sortOrder: 2 },
  { id: 'B3', label: 'B3', grade: '3等級', sortOrder: 3 },
  { id: 'B4', label: 'B4', grade: '4等級', sortOrder: 4 },
  { id: 'B5', label: 'B5', grade: '5等級', sortOrder: 5 },
  { id: 'B6', label: 'B6', grade: '6等級', sortOrder: 6 },
  { id: 'B7', label: 'B7', grade: '7等級', sortOrder: 7 },
]

const RAW_TRANSFER_REASONS = [
  '組織異動', '昇格', '降格', '出向', '出向解除',
  '兼務追加', '兼務解除', '採用', '退職', 'その他',
]

const RAW_POSITION_TITLES = [
  '部長', '副部長', '課長', '主任', '担当', '専門職',
  '本部長', '室長', '所長', '次長', 'マネージャー', '兼務',
]

export class MockMasterRepository implements IMasterRepository {
  async getBands(): Promise<BandOption[]> {
    return RAW_BANDS.map(b => BandOptionSchema.parse(b))
  }
  async getTransferReasons(): Promise<string[]> {
    return RAW_TRANSFER_REASONS
  }
  async getPositionTitles(): Promise<string[]> {
    return RAW_POSITION_TITLES
  }
}

// ── Companies ──────────────────────────────────────────────────
export class MockCompanyRepository implements ICompanyRepository {
  async getAll(): Promise<Company[]> { return [] }
}

// ── Organizations ──────────────────────────────────────────────
export class MockOrganizationRepository implements IOrganizationRepository {
  async getAll(): Promise<Organization[]> { return [] }
  async getByCompany(_companyId: string): Promise<Organization[]> { return [] }
}

// ── Persons ───────────────────────────────────────────────────
export class MockPersonRepository implements IPersonRepository {
  async getAll(): Promise<Person[]> { return [] }
  async getById(_id: string): Promise<Person | null> { return null }
}

// ── Positions (Before state) ───────────────────────────────────
export class MockPositionRepository implements IPositionRepository {
  async getAll(): Promise<Position[]> { return [] }
}

// ── Affiliations (Before state) ────────────────────────────────
export class MockAffiliationRepository implements IAffiliationRepository {
  async getAll(): Promise<Affiliation[]> { return [] }
}

// ── Operations ────────────────────────────────────────────────
export class MockOperationRepository implements IOperationRepository {
  private ops: Operation[] = []

  async getAll(): Promise<Operation[]> { return [...this.ops] }
  async save(op: Operation): Promise<void> {
    const idx = this.ops.findIndex(o => o.id === op.id)
    if (idx >= 0) { this.ops[idx] = op } else { this.ops.push(op) }
  }
  async delete(id: string): Promise<void> {
    this.ops = this.ops.filter(o => o.id !== id)
  }
}
