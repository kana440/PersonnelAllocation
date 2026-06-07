import { describe, test, expect } from 'vitest'
import { computeRowDiffs, mergeRow, mergeSubmission, diffRow } from '@personnel/domain/diffMerge'
import { makeRow, makePosRow, makePersonRow } from './helpers/fixtures'
import type { AllocationRow } from '@personnel/domain/allocationRow'

// ── computeRowDiffs ───────────────────────────────────────────────────────────

describe('computeRowDiffs', () => {
  describe('基本的な分類', () => {
    test('空配列同士 → 空', () => {
      expect(computeRowDiffs([], [])).toEqual([])
    })

    test('before のみに行がある → removed', () => {
      const before = [makeRow({ rowId: 1, departmentCode: 'A01' })]
      const diffs  = computeRowDiffs(before, [])
      expect(diffs).toHaveLength(1)
      expect(diffs[0].kind).toBe('removed')
      expect(diffs[0].rowId).toBe(1)
    })

    test('after のみに行がある → added', () => {
      const after = [makeRow({ rowId: 2, departmentCode: 'B01' })]
      const diffs = computeRowDiffs([], after)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].kind).toBe('added')
      expect(diffs[0].rowId).toBe(2)
    })

    test('before と after が同一内容 → 空（modified なし）', () => {
      const row = makePosRow({ rowId: 1 })
      expect(computeRowDiffs([row], [row])).toHaveLength(0)
    })

    test('業務フィールド変更 → modified', () => {
      const before = [makePosRow({ rowId: 1, band: 'M4' as AllocationRow['band'] })]
      const after  = [makePosRow({ rowId: 1, band: 'M5' as AllocationRow['band'] })]
      const diffs  = computeRowDiffs(before, after)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].kind).toBe('modified')
      expect(diffs[0].rowId).toBe(1)
    })

    test('変更あり行・変更なし行が混在 → 変更あり行のみ結果に含む', () => {
      const unchanged = makePosRow({ rowId: 1 })
      const before    = [unchanged, makePosRow({ rowId: 2, departmentCode: 'OLD' })]
      const after     = [unchanged, makePosRow({ rowId: 2, departmentCode: 'NEW' })]
      const diffs     = computeRowDiffs(before, after)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].rowId).toBe(2)
    })
  })

  describe('modified の changes 詳細', () => {
    test('変更フィールドを changes に記録する', () => {
      const before = [makePosRow({ rowId: 1, departmentCode: 'OLD', officialPositionCode: '部長' })]
      const after  = [makePosRow({ rowId: 1, departmentCode: 'NEW', officialPositionCode: '部長' })]
      const diffs  = computeRowDiffs(before, after)
      const mod    = diffs[0]
      expect(mod.kind).toBe('modified')
      const change = mod.changes.find(c => c.fieldKey === 'departmentCode')
      expect(change).toMatchObject({ before: 'OLD', after: 'NEW' })
    })

    test('複数フィールド変更 → すべて changes に含む', () => {
      const before = [makePosRow({ rowId: 1, departmentCode: 'A', officialPositionCode: '部長' })]
      const after  = [makePosRow({ rowId: 1, departmentCode: 'B', officialPositionCode: '課長' })]
      const diffs  = computeRowDiffs(before, after)
      expect(diffs[0].changes.length).toBeGreaterThanOrEqual(2)
    })

    test('non-DIFF_FIELDS（rowId・userId）は changes に含まれない', () => {
      // rowId が変わっても同一キーならスキップ（デフォルト matchFn は rowId なので別扱い）
      // userId はフィールドとして DIFF_FIELDS に含まれない
      const before = [makePersonRow({ rowId: 1, userId: 'U001' })]
      const after  = [makePersonRow({ rowId: 1, userId: 'U999' })]
      const diffs  = computeRowDiffs(before, after)
      // userId を変えても changes に userId は含まれない
      const hasUserId = diffs.some(d => d.changes.some(c => c.fieldKey === 'userId'))
      expect(hasUserId).toBe(false)
    })

    test('orgCode に departmentCode を格納する', () => {
      const before = [makePosRow({ rowId: 1, departmentCode: 'ORG001', officialPositionCode: '部長' })]
      const after  = [makePosRow({ rowId: 1, departmentCode: 'ORG001', officialPositionCode: '課長' })]
      const diffs  = computeRowDiffs(before, after)
      expect(diffs[0].orgCode).toBe('ORG001')
    })
  })

  describe('displayName の導出', () => {
    test('lastName + firstName → フルネーム', () => {
      const row   = makePersonRow({ rowId: 1, lastName: '山田', firstName: '太郎' })
      const diffs = computeRowDiffs([row], [])
      expect(diffs[0].displayName).toBe('山田太郎')
    })

    test('lastName のみ → lastName', () => {
      const row   = makeRow({ rowId: 1, lastName: '山田' } as Partial<AllocationRow>)
      const diffs = computeRowDiffs([row], [])
      expect(diffs[0].displayName).toBe('山田')
    })

    test('名前なし・userId あり → userId', () => {
      const row   = makeRow({ rowId: 1, userId: 'U001' } as Partial<AllocationRow>)
      const diffs = computeRowDiffs([row], [])
      expect(diffs[0].displayName).toBe('U001')
    })

    test('名前・userId なし・positionCode あり → positionCode', () => {
      // makePersonRow は userId を設定するので positionCode のみにするため makeRow から
      const noPersonRow = makeRow({
        rowId: 1,
        positionCode: 'P99999999',
      } as Partial<AllocationRow>)
      const diffs = computeRowDiffs([noPersonRow], [])
      expect(diffs[0].displayName).toBe('P99999999')
    })

    test('何もなければ row{rowId}', () => {
      const row   = makeRow({ rowId: 42 })
      const diffs = computeRowDiffs([row], [])
      expect(diffs[0].displayName).toBe('row42')
    })
  })

  describe('matchFn', () => {
    test('matchFn が null を返す行は diff 対象外', () => {
      // null を返す matchFn なのでどちらの行も無視される
      const before = [makeRow({ rowId: 1 })]
      const after  = [makeRow({ rowId: 2 })]
      const diffs  = computeRowDiffs(before, after, () => null)
      expect(diffs).toHaveLength(0)
    })

    test('STEP1 用 matchFn: groupEmployeeId|departmentCode で照合', () => {
      const step1Fn = (r: AllocationRow): string | null =>
        r.groupEmployeeId ? `${r.groupEmployeeId}|${r.departmentCode ?? ''}` : null

      const before = [makePersonRow({ rowId: 1, groupEmployeeId: 'EMP001', departmentCode: 'A', officialPositionCode: '部長' })]
      // rowId が異なっていても同じ groupEmployeeId|departmentCode なら modified として検出
      const after  = [makePersonRow({ rowId: 99, groupEmployeeId: 'EMP001', departmentCode: 'A', officialPositionCode: '課長' })]

      const diffs = computeRowDiffs(before, after, step1Fn)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].kind).toBe('modified')
    })

    test('STEP1 用 matchFn: groupEmployeeId が未設定の行はスキップ', () => {
      const step1Fn = (r: AllocationRow): string | null =>
        r.groupEmployeeId ? `${r.groupEmployeeId}|${r.departmentCode ?? ''}` : null

      const before = [makeRow({ rowId: 1 })]  // groupEmployeeId なし
      const after  = [makeRow({ rowId: 1 })]
      const diffs  = computeRowDiffs(before, after, step1Fn)
      expect(diffs).toHaveLength(0)
    })
  })
})

// ── mergeRow ─────────────────────────────────────────────────────────────────

describe('mergeRow', () => {
  // 基準行（委任時スナップショット）
  const base = makePersonRow({ rowId: 1, band: 'M4' as AllocationRow['band'], departmentCode: 'ORG001', officialPositionCode: '部長' })

  test('どちらも変更なし → ours を保持・conflict なし', () => {
    const { merged, conflicts } = mergeRow(base, base, base)
    expect(merged.band).toBe('M4')
    expect(conflicts).toHaveLength(0)
  })

  test('theirs のみ変更 → theirs を採用', () => {
    const ours   = { ...base }
    const theirs = { ...base, band: 'M5' as AllocationRow['band'] }
    const { merged, conflicts } = mergeRow(base, ours, theirs)
    expect(merged.band).toBe('M5')
    expect(conflicts).toHaveLength(0)
  })

  test('ours のみ変更 → ours を保持', () => {
    const ours   = { ...base, band: 'M6' as AllocationRow['band'] }
    const theirs = { ...base }
    const { merged, conflicts } = mergeRow(base, ours, theirs)
    expect(merged.band).toBe('M6')
    expect(conflicts).toHaveLength(0)
  })

  test('両方が同じ値に変更 → ours を保持・conflict なし', () => {
    const ours   = { ...base, band: 'M5' as AllocationRow['band'] }
    const theirs = { ...base, band: 'M5' as AllocationRow['band'] }
    const { merged, conflicts } = mergeRow(base, ours, theirs)
    expect(merged.band).toBe('M5')
    expect(conflicts).toHaveLength(0)
  })

  test('両方が異なる値に変更 → ours を保持・conflict に追加', () => {
    const ours   = { ...base, band: 'M5' as AllocationRow['band'] }
    const theirs = { ...base, band: 'M3' as AllocationRow['band'] }
    const { merged, conflicts } = mergeRow(base, ours, theirs)
    expect(merged.band).toBe('M5')  // ours を保持
    expect(conflicts).toContain('band')
  })

  test('複数フィールド混在: theirs 採用・ours 保持・conflict が同時に発生', () => {
    const ours   = { ...base, departmentCode: 'ORG999', officialPositionCode: '課長' }
    const theirs = { ...base, departmentCode: 'ORG002', band: 'M5' as AllocationRow['band'] }
    const { merged, conflicts } = mergeRow(base, ours, theirs)

    // departmentCode: ours='ORG999', theirs='ORG002' → 両者異なる → conflict
    expect(conflicts).toContain('departmentCode')
    expect(merged.departmentCode).toBe('ORG999')  // ours 保持

    // band: ours=base(M4), theirs='M5' → theirs のみ変更 → 採用
    expect(merged.band).toBe('M5')

    // officialPositionCode: ours='課長', theirs=base(部長) → ours のみ変更 → 保持
    expect(merged.officialPositionCode).toBe('課長')
  })

  test('非 DIFF_FIELDS（rowId・userId）は merge/conflict 対象外', () => {
    // userId を変えても conflict にならない
    const ours   = { ...base, userId: 'U111' }
    const theirs = { ...base, userId: 'U999' }
    const { conflicts } = mergeRow(base, ours, theirs)
    const hasUserId = conflicts.some(k => k === 'userId')
    expect(hasUserId).toBe(false)
  })

  test('merged は ours をベースとする（ours の全フィールドを継承）', () => {
    const ours   = { ...base, lastName: 'ours-only-name' }
    const theirs = { ...base }
    const { merged } = mergeRow(base, ours, theirs)
    expect(merged.rowId).toBe(ours.rowId)
    expect(merged.userId).toBe(ours.userId)
  })
})

// ── mergeSubmission ───────────────────────────────────────────────────────────

describe('mergeSubmission', () => {
  const mkRow = (rowId: number, band: string) =>
    makePersonRow({ rowId, band: band as AllocationRow['band'] })

  test('正常マージ: 全 snapshot 行が結果に含まれる', () => {
    const snap      = [mkRow(1, 'M4'), mkRow(2, 'M4')]
    const current   = [mkRow(1, 'M4'), mkRow(2, 'M5')]  // row2: ours 変更
    const submitted = [mkRow(1, 'M6'), mkRow(2, 'M4')]  // row1: theirs 変更

    const result = mergeSubmission(snap, current, submitted)
    expect(result.size).toBe(2)

    // row1: theirs のみ変更 → M6 採用
    expect(result.get(1)!.merged.band).toBe('M6')
    // row2: ours のみ変更 → M5 保持
    expect(result.get(2)!.merged.band).toBe('M5')
  })

  test('snapshot に存在しない rowId は merge 対象外', () => {
    const snap      = [mkRow(1, 'M4')]
    const current   = [mkRow(1, 'M4'), mkRow(99, 'M4')]   // 99 は snapshot に なし
    const submitted = [mkRow(1, 'M4'), mkRow(99, 'M5')]
    const result    = mergeSubmission(snap, current, submitted)
    expect(result.has(99)).toBe(false)
    expect(result.has(1)).toBe(true)
  })

  test('currentRows に rowId がない行はスキップ', () => {
    const snap      = [mkRow(1, 'M4'), mkRow(2, 'M4')]
    const current   = [mkRow(1, 'M4')]                    // row2 なし
    const submitted = [mkRow(1, 'M4'), mkRow(2, 'M5')]
    const result    = mergeSubmission(snap, current, submitted)
    expect(result.has(2)).toBe(false)
    expect(result.has(1)).toBe(true)
  })

  test('submittedRows に rowId がない行はスキップ', () => {
    const snap      = [mkRow(1, 'M4'), mkRow(2, 'M4')]
    const current   = [mkRow(1, 'M4'), mkRow(2, 'M5')]
    const submitted = [mkRow(1, 'M4')]                    // row2 なし
    const result    = mergeSubmission(snap, current, submitted)
    expect(result.has(2)).toBe(false)
    expect(result.has(1)).toBe(true)
  })

  test('空 snapshot → 空 Map', () => {
    const result = mergeSubmission([], [mkRow(1, 'M4')], [mkRow(1, 'M5')])
    expect(result.size).toBe(0)
  })

  test('conflict が発生した行も結果 Map に含まれる', () => {
    const snap      = [mkRow(1, 'M4')]
    const current   = [mkRow(1, 'M5')]  // ours: M5
    const submitted = [mkRow(1, 'M3')]  // theirs: M3（異なる値）
    const result    = mergeSubmission(snap, current, submitted)
    const r         = result.get(1)!
    expect(r.merged.band).toBe('M5')       // ours 保持
    expect(r.conflicts).toContain('band')
  })
})

// ── diffRow ───────────────────────────────────────────────────────────────────

describe('diffRow', () => {
  test('変更なし → 空オブジェクト', () => {
    const row = makePersonRow({ rowId: 1 })
    expect(diffRow(row, row)).toEqual({})
  })

  test('変更ありフィールドのみ返す', () => {
    const base     = makePersonRow({ rowId: 1, band: 'M4' as AllocationRow['band'] })
    const modified = { ...base, band: 'M5' as AllocationRow['band'] }
    const patch    = diffRow(base, modified)
    expect(patch.band).toBe('M5')
    // 変更していないフィールドは含まれない
    expect('rowId' in patch).toBe(false)
    expect('userId' in patch).toBe(false)
  })

  test('複数フィールド変更 → すべて含む', () => {
    const base     = makePosRow({ rowId: 1, departmentCode: 'A', officialPositionCode: '部長' })
    const modified = { ...base, departmentCode: 'B', officialPositionCode: '課長' }
    const patch    = diffRow(base, modified)
    expect(patch.departmentCode).toBe('B')
    expect(patch.officialPositionCode).toBe('課長')
  })

  test('非 DIFF_FIELDS（rowId）の変更は含まれない', () => {
    const base     = makePersonRow({ rowId: 1 })
    const modified = { ...base, rowId: 99 }
    const patch    = diffRow(base, modified)
    expect('rowId' in patch).toBe(false)
  })
})
