// derivation/orgFields.ts + managerFields.ts のテスト
import { describe, test, expect } from 'vitest'
import { deriveOrgSubFields, reDeriveOrgSubFieldsForList } from '@personnel/domain/derivation/orgFields'
import { deriveManagerName, reDeriveManagerNamesForList }  from '@personnel/domain/derivation/managerFields'
import { makeRow, makeCL, MOCK_ORG_ENTRIES } from '../helpers/fixtures'

// ── deriveOrgSubFields ────────────────────────────────────────────────────────
// departmentCode から組織サブフィールドを導出する

describe('deriveOrgSubFields', () => {
  const ms = makeCL()

  test('既知の org コード → サブフィールドを返す', () => {
    const result = deriveOrgSubFields('ORG001', ms)
    expect(result.businessUnit).toBe(MOCK_ORG_ENTRIES.normal.pathBusinessUnit)
    expect(result.costCenter).toBe(MOCK_ORG_ENTRIES.normal.costCenter)
    expect(result.location).toBe(MOCK_ORG_ENTRIES.normal.workLocation)
  })

  test('不明な org コード → 空オブジェクト', () => {
    const result = deriveOrgSubFields('UNKNOWN', ms)
    expect(result).toEqual({})
  })

  test('after phase を before より優先する', () => {
    const clWithBefore = makeCL({
      orgMasterEntries: [
        { ...MOCK_ORG_ENTRIES.normal, phase: 'before', pathBusinessUnit: 'BU_OLD' },
        { ...MOCK_ORG_ENTRIES.normal, phase: 'after',  pathBusinessUnit: 'BU_NEW' },
      ],
    })
    const result = deriveOrgSubFields('ORG001', clWithBefore)
    expect(result.businessUnit).toBe('BU_NEW')
  })

  test('空文字列のフィールドは undefined を返す', () => {
    const clWithEmpty = makeCL({
      orgMasterEntries: [
        { ...MOCK_ORG_ENTRIES.normal, pathGroup: '', pathTeam: '' },
      ],
    })
    const result = deriveOrgSubFields('ORG001', clWithEmpty)
    expect(result.group).toBeUndefined()
    expect(result.team).toBeUndefined()
  })
})

// ── reDeriveOrgSubFieldsForList ───────────────────────────────────────────────
// 全行に対して org サブフィールドを再導出する

describe('reDeriveOrgSubFieldsForList', () => {
  test('departmentCode が変わった行のみ再導出される', () => {
    const ms = makeCL()
    const rows = [
      makeRow({ rowId: 1, departmentCode: 'ORG001', businessUnit: 'OLD_BU' }),
      makeRow({ rowId: 2, departmentCode: undefined }),  // org コードなし → 変化なし
    ]
    const result = reDeriveOrgSubFieldsForList(rows, ms)
    // ORG001 の行は businessUnit が更新される
    expect(result.find(r => r.rowId === 1)?.businessUnit).toBe(MOCK_ORG_ENTRIES.normal.pathBusinessUnit)
    // org コードなし行は変化なし
    expect(result.find(r => r.rowId === 2)?.businessUnit).toBeUndefined()
  })
})

// ── deriveManagerName ─────────────────────────────────────────────────────────
// managerPositionCode から上司氏名を導出する

describe('deriveManagerName', () => {
  const mgrRow = makeRow({
    positionCode: 'P_MGR',
    userId:    'u_mgr',
    lastName:  '田中',
    firstName: '部長',
  })

  test('managerPositionCode に在席者がいる → 氏名を返す', () => {
    const name = deriveManagerName('P_MGR', [mgrRow])
    expect(name).toBe('田中, 部長')
  })

  test('managerPositionCode が空席（userId なし）→ undefined', () => {
    const vacantMgr = makeRow({ positionCode: 'P_MGR', userId: undefined })
    expect(deriveManagerName('P_MGR', [vacantMgr])).toBeUndefined()
  })

  test('managerPositionCode が見つからない → undefined', () => {
    expect(deriveManagerName('P_UNKNOWN', [mgrRow])).toBeUndefined()
  })

  test('managerPositionCode が undefined → undefined', () => {
    expect(deriveManagerName(undefined, [mgrRow])).toBeUndefined()
  })
})

// ── reDeriveManagerNamesForList ───────────────────────────────────────────────
// 全行の managerName を一括再導出する

describe('reDeriveManagerNamesForList', () => {
  test('上司の在席行がある場合に managerName が設定される', () => {
    const mgrRow = makeRow({ rowId: 1, positionCode: 'P_MGR', userId: 'u1', lastName: '田中', firstName: '部長' })
    const subRow = makeRow({ rowId: 2, managerPositionCode: 'P_MGR', managerName: undefined })
    const result = reDeriveManagerNamesForList([mgrRow, subRow])
    expect(result.find(r => r.rowId === 2)?.managerName).toBe('田中, 部長')
  })

  test('managerPositionCode がない行は変更されない', () => {
    const row    = makeRow({ rowId: 1, managerPositionCode: undefined })
    const result = reDeriveManagerNamesForList([row])
    expect(result[0]).toBe(row)  // 同一参照（変更なし）
  })

  test('上司が退席（userId なし）になっても managerName はそのまま保持される', () => {
    // reDeriveManagerNamesForList は「名前を見つけたら更新」であり、
    // 見つからない場合は既存の managerName を変更しない設計。
    const vacantMgr = makeRow({ rowId: 1, positionCode: 'P_MGR', userId: undefined })
    const subRow    = makeRow({ rowId: 2, managerPositionCode: 'P_MGR', managerName: '田中, 部長' })
    const result    = reDeriveManagerNamesForList([vacantMgr, subRow])
    // 空席 → posToName に登録されない → 既存の managerName は変わらない
    expect(result.find(r => r.rowId === 2)?.managerName).toBe('田中, 部長')
  })
})
