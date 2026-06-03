// choices/orgTree.ts のテスト
import { describe, test, expect } from 'vitest'
import { getDescendantOrgIds, flattenOrgTree } from '../../src/domain/choices/orgTree'
import type { Organization } from '../../src/domain/schemas'

// ── テスト用組織ツリー ──────────────────────────────────────────────────────────
//
//  ROOT
//  ├── A
//  │   ├── A1
//  │   └── A2
//  └── B
//      └── B1

function makeOrg(id: string, parentId: string | null): Organization {
  return { id, name: id, parentId, companyId: 'c1', externalCode: id }
}

const ORGS: Organization[] = [
  makeOrg('ROOT', null),
  makeOrg('A',    'ROOT'),
  makeOrg('A1',   'A'),
  makeOrg('A2',   'A'),
  makeOrg('B',    'ROOT'),
  makeOrg('B1',   'B'),
]

// ── getDescendantOrgIds ────────────────────────────────────────────────────────

describe('getDescendantOrgIds', () => {
  test('ルートから全子孫を取得', () => {
    const ids = getDescendantOrgIds('ROOT', ORGS)
    expect(ids).toEqual(new Set(['ROOT', 'A', 'A1', 'A2', 'B', 'B1']))
  })

  test('中間ノードから配下のみ取得', () => {
    const ids = getDescendantOrgIds('A', ORGS)
    expect(ids).toEqual(new Set(['A', 'A1', 'A2']))
    expect(ids.has('B')).toBe(false)
    expect(ids.has('ROOT')).toBe(false)
  })

  test('葉ノードは自分自身のみ', () => {
    const ids = getDescendantOrgIds('B1', ORGS)
    expect(ids).toEqual(new Set(['B1']))
  })

  test('存在しない ID は自分自身のみ', () => {
    const ids = getDescendantOrgIds('UNKNOWN', ORGS)
    expect(ids).toEqual(new Set(['UNKNOWN']))
  })
})

// ── flattenOrgTree ─────────────────────────────────────────────────────────────

describe('flattenOrgTree', () => {
  test('DFS 順で返す', () => {
    const flat = flattenOrgTree(ORGS)
    const ids   = flat.map(e => e.org.id)
    // ROOT が最初、A の後に A1・A2 が来る
    expect(ids[0]).toBe('ROOT')
    const aIdx  = ids.indexOf('A')
    const a1Idx = ids.indexOf('A1')
    const a2Idx = ids.indexOf('A2')
    expect(aIdx).toBeLessThan(a1Idx)
    expect(a1Idx).toBeLessThan(a2Idx)
  })

  test('depth が正しい', () => {
    const flat   = flattenOrgTree(ORGS)
    const byId   = Object.fromEntries(flat.map(e => [e.org.id, e.depth]))
    expect(byId['ROOT']).toBe(0)
    expect(byId['A']).toBe(1)
    expect(byId['A1']).toBe(2)
    expect(byId['B1']).toBe(2)
  })

  test('空配列は空を返す', () => {
    expect(flattenOrgTree([])).toEqual([])
  })
})
