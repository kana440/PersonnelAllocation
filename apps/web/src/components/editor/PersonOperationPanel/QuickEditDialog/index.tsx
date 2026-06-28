/**
 * QuickEditDialog — 簡易操作ダイアログ
 *
 * EditOperation.quickInputs が定義されている操作に対して使用する。
 * - 最小限のキー入力のみ表示（2〜3フィールド）
 * - onSubmit ドライランで変更内容をプレビュー
 * - バリデーションエラー時は「確定」を無効化し、詳細編集を促す
 * - 「詳細編集」で現在の入力値を引き継いで OperationFormView に遷移する
 */
import { useState, useMemo, useCallback } from 'react'
import { useStore }            from '../../../../store/useStore'
import { appService }          from '../../../../application/HRApplicationService'
import { deriveFieldUpdates }  from '@personnel/domain/derivation'
import { bindOperation }       from '@personnel/domain/commands/defs'
import { getGroupedFieldOptions } from '@personnel/domain/choices'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { ComboInput }          from '../../../common/ComboInput'
import { OrgPickerModal }      from '../../../common/OrgPickerModal'
import { ChangePreview }       from './ChangePreview'
import type { EditOperation, OperationInput } from '@personnel/domain/commands/defs'
import type { AllocationRow }  from '@personnel/domain/allocationRow'
import type { DomainContext }  from '@personnel/domain/context'

interface Props {
  def:      EditOperation
  row:      AllocationRow
  onClose:  () => void
  /** 「詳細編集」クリック時。現在の入力値を渡すので OperationFormView の overrideInitial に使う */
  onDetail: (currentValues: Partial<AllocationRow>) => void
}

export function QuickEditDialog({ def, row, onClose, onDetail }: Props) {
  const { allocationList, afterOrganizations, masters } = useStore()
  const ctx = useMemo(
    () => ({ allocationList, afterOrganizations, masters }),
    [allocationList, afterOrganizations, masters],
  )

  const [values, setValues]               = useState<Partial<AllocationRow>>(() => def.onOpen(row, ctx))
  const [orgPickerField, setOrgPickerField] = useState<string | null>(null)
  const [submitError,   setSubmitError]   = useState<string | null>(null)

  const draftRow = useMemo(() => ({ ...row, ...values } as AllocationRow), [row, values])

  // 部下がいる場合: _managerTransferMode が設定されている
  const hasSubordinates = !!(values as Record<string, unknown>)._managerTransferMode
  const isInheritMode   = (values as Record<string, unknown>)._managerTransferMode !== '他メンバに引き継ぎ'

  // 「部下の引き継ぎ方法」ラジオを表示する条件:
  //   payGrade が prevPayGrade と異なる（給与等級変化） かつ
  //   新 positionCode ≠ prevPositionCode（＝自動新設が走った）
  //   かつ 部下がいる
  const payGradeChanged  = !!(draftRow.payGradeChangeSign as string | undefined)
  const positionRenewed  = (draftRow.positionCode as string | undefined) !==
                           (row.prevPositionCode  as string | undefined)
  const showSubordinateRadio = hasSubordinates && payGradeChanged && positionRenewed

  const subordinateCount = allocationList.filter(
    r => (r.managerPositionCode as string | undefined) === (row.positionCode as string | undefined)
  ).length

  const setSubordinateMode = (mode: '引き継ぐ' | '他メンバに引き継ぎ') =>
    setValues(prev => ({ ...prev, _managerTransferMode: mode } as Partial<AllocationRow>))

  const handleChange = useCallback((field: keyof AllocationRow, value: string) => {
    setValues(prev => {
      const prevDraft = { ...row, ...prev } as AllocationRow
      const changes   = { [field]: value } as Partial<AllocationRow>
      type FCMap = Partial<Record<string, (v: string, ctx: DomainContext, currentValues?: Partial<AllocationRow>) => { setValues?: Partial<AllocationRow> }>>
      const effects   = (def.onFieldChange as FCMap | undefined)?.[field as string]?.(value, ctx, prev)
      const derived   = deriveFieldUpdates(
        { ...changes, ...(effects?.setValues ?? {}) },
        prevDraft, masters, allocationList,
      )
      return { ...prev, ...changes, ...(effects?.setValues ?? {}), ...derived }
    })
  }, [def, row, ctx, masters, allocationList])

  // バリデーション
  const validation = useMemo(
    () => def.onValidate(ctx, row.rowId, values),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, row.rowId],
  )

  // ドライランでプレビュー結果を取得（バリデーション OK のときのみ）
  const previewResult = useMemo(() => {
    if (!validation.ok) return null
    try {
      return def.onSubmit(ctx, row.rowId, values)
    } catch { return null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, validation.ok, row.rowId])

  const errorMsg = !validation.ok
    ? (validation.errors as Array<{ message: string }>).map(e => e.message).join('、')
    : null

  const handleConfirm = () => {
    const cmd    = bindOperation(def, row.rowId, values)
    const result = appService.executeOperation(cmd)
    if (!result.ok) {
      setSubmitError((result.errors as Array<{ message: string }>).map(e => e.message).join('\n'))
      return
    }
    onClose()
  }

  const quickInputs = def.quickInputs!

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[460px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── ヘッダー ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-gray-800">{def.label}</span>
            <span className="text-xs text-gray-400 truncate">
              {[row.lastName, row.firstName].filter(Boolean).join(' ')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2 text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* ── 簡易入力フィールド ────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0 space-y-3">
          {quickInputs.map((input: OperationInput) => {
            const fieldKey   = input.field as string
            const fieldLabel = input.label ?? ALLOCATION_LIST_LABEL_MAP[fieldKey]?.ja ?? fieldKey
            const currentVal = (draftRow[input.field as keyof AllocationRow] as string | undefined) ?? ''

            // 組織ピッカー
            if (input.picker === 'org') {
              const orgName = afterOrganizations.find(
                o => o.externalCode === currentVal || o.id === currentVal
              )?.name ?? currentVal
              return (
                <div key={fieldKey}>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {fieldLabel}
                    {input.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <button
                    type="button"
                    onClick={() => setOrgPickerField(fieldKey)}
                    className="w-full text-left px-2.5 py-[5px] text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span className="flex-1 truncate">
                      {orgName || <span className="text-gray-400">組織を選択...</span>}
                    </span>
                    <span className="text-gray-400 text-xs flex-shrink-0">🔍</span>
                  </button>
                </div>
              )
            }

            // ドロップダウン（ComboInput）
            const { valid, invalid } = getGroupedFieldOptions(fieldKey, draftRow, masters)
            return (
              <div key={fieldKey}>
                <label className="text-xs text-gray-500 mb-1 block">
                  {fieldLabel}
                  {input.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <ComboInput
                  value={currentVal}
                  options={valid}
                  invalidOptions={invalid}
                  strictness={invalid.length > 0 ? 'guide' : 'free'}
                  onChange={v => handleChange(input.field as keyof AllocationRow, v)}
                />
              </div>
            )
          })}
        </div>

        {/* ── 変更内容プレビュー ────────────────────────────────────────────── */}
        {previewResult && (
          <ChangePreview
            anchorRow={row}
            originalList={allocationList}
            updatedList={previewResult.updatedList}
          />
        )}

        {/* ── 部下引き継ぎ方法ラジオ（payGrade変化 + 新設ポジション + 部下あり の時のみ表示）── */}
        {showSubordinateRadio && (
          <div className="px-5 py-3 border-t flex-shrink-0 space-y-2">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              部下の引き継ぎ方法
            </div>

            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input
                type="radio"
                name="subordinateMode"
                checked={isInheritMode}
                onChange={() => setSubordinateMode('引き継ぐ')}
                className="mt-0.5 text-blue-600 focus:ring-blue-500"
              />
              <span>新ポジションへ引き継ぐ</span>
            </label>

            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input
                type="radio"
                name="subordinateMode"
                checked={!isInheritMode}
                onChange={() => setSubordinateMode('他メンバに引き継ぎ')}
                className="mt-0.5 text-blue-600 focus:ring-blue-500"
              />
              <span>旧ポジションに空席を残す</span>
            </label>

            <p className="text-[10px] text-gray-400 leading-relaxed pl-0.5">
              {isInheritMode
                ? `部下 ${subordinateCount} 名の上司コードを新ポジションに更新します。`
                : `旧ポジション（${row.positionCode ?? ''}）を空席行として残します。部下 ${subordinateCount} 名の上司コードは変更されません。`
              }
            </p>
          </div>
        )}

        {/* ── バリデーションエラー ───────────────────────────────────────── */}
        {errorMsg && (
          <div className="px-5 py-2 bg-orange-50 border-t border-orange-100 flex-shrink-0">
            <p className="text-xs text-orange-600">
              {errorMsg}
              {' — '}
              <button
                type="button"
                onClick={() => onDetail(values)}
                className="underline font-medium hover:text-orange-800"
              >
                詳細編集
              </button>
              で修正してください
            </p>
          </div>
        )}
        {submitError && (
          <div className="px-5 py-2 bg-red-50 border-t border-red-100 flex-shrink-0">
            <p className="text-xs text-red-500 whitespace-pre-wrap">{submitError}</p>
          </div>
        )}

        {/* ── フッターボタン ────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={() => onDetail(values)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            詳細編集
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!validation.ok}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              確定
            </button>
          </div>
        </div>
      </div>

      {/* 組織ピッカーモーダル */}
      {orgPickerField && (
        <OrgPickerModal
          open={true}
          onClose={() => setOrgPickerField(null)}
          onSelect={orgId => {
            const org     = afterOrganizations.find(o => o.id === orgId)
            const orgCode = org?.externalCode ?? orgId
            handleChange(orgPickerField as keyof AllocationRow, orgCode)
            setOrgPickerField(null)
          }}
        />
      )}
    </div>
  )
}
