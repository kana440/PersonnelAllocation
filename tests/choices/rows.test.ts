// choices/rows.ts のテスト
import { describe, test, expect } from 'vitest'
import { buildOrgMap, derivePersons } from '../../src/domain/choices/rows'
import { makeRow } from '../helpers/fixtures'
import type { Organization } from '../../src/domain/schemas'

function makeOrg(id: string, externalCode?: string): Organization {
  return { id, name: id, parentId: null, companyId: 'c1', externalCode }
}

// ── buildOrgMap ────────────────────────────────────────────────────────────────

describe('buildOrgMap', () => {
  test('id でルックアップできる', () => {
    const orgs = [makeOrg('org-1', 'ORG001')]
    const map  = buildOrgMap(orgs)
    expect(map.get('org-1')?.id).toBe('org-1')
  })

  test('externalCode でもルックアップできる', () => {
    const orgs = [makeOrg('org-1', 'ORG001')]
    const map  = buildOrgMap(orgs)
    expect(map.get('ORG001')?.id).toBe('org-1')
  })

  test('externalCode がない org は id のみ登録', () => {
    const orgs = [makeOrg('org-1')]   // externalCode なし
    const map  = buildOrgMap(orgs)
    expect(map.size).toBe(1)
    expect(map.has('org-1')).toBe(true)
  })

  test('空配列は空 Map を返す', () => {
    expect(buildOrgMap([])).toEqual(new Map())
  })
})

// ── derivePersons ──────────────────────────────────────────────────────────────

describe('derivePersons', () => {
  test('userId ごとに dedupe する', () => {
    const rows = [
      makeRow({ userId: 'u1', lastName: '山田', firstName: '太郎', groupEmployeeId: 'u1' }),
      makeRow({ userId: 'u1', lastName: '山田', firstName: '太郎', groupEmployeeId: 'u1' }), // 重複
      makeRow({ userId: 'u2', lastName: '鈴木', firstName: '花子', groupEmployeeId: 'u2' }),
    ]
    const persons = derivePersons(rows)
    expect(persons).toHaveLength(2)
    expect(persons.map(p => p.sfPersonId)).toEqual(['u1', 'u2'])
  })

  test('userId がない行は除外', () => {
    const rows = [
      makeRow({ userId: undefined }),   // 空席
      makeRow({ userId: 'u1', lastName: '山田', firstName: '太郎', groupEmployeeId: 'u1' }),
    ]
    const persons = derivePersons(rows)
    expect(persons).toHaveLength(1)
    expect(persons[0].sfPersonId).toBe('u1')
  })

  test('name は lastName + firstName を結合', () => {
    const rows = [makeRow({ userId: 'u1', lastName: '山田', firstName: '太郎', groupEmployeeId: 'u1' })]
    expect(derivePersons(rows)[0].name).toBe('山田 太郎')
  })

  test('name がなければ userId をフォールバック', () => {
    const rows = [makeRow({ userId: 'u1', lastName: undefined, firstName: undefined, groupEmployeeId: 'u1' })]
    expect(derivePersons(rows)[0].name).toBe('u1')
  })
})
