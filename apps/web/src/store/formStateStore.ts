import { create } from 'zustand/react'
import type { AllocationRow } from '@personnel/domain/allocationRow'

/**
 * フォーム ↔ AI の双方向ブリッジ。
 *
 * 【フォーム → AI】（読み取り）
 *   OperationFormView が値を変更するたびに publish() で更新する。
 *   AI は ui_get_form_state ツールでここを読む。
 *   → getFieldOptions(rowId, field) と組み合わせると
 *     「今開いているフォームで選べる値」をAIが把握できる。
 *
 * 【AI → フォーム】（書き込み）
 *   AI が ui_suggest_form_field を呼ぶと pendingSuggestion にセットされる。
 *   OperationFormView が useEffect でそれを検知し、
 *   内部の handleChange() に通すことで連動導出・バリデーションを維持する。
 */
export interface FormSnapshot {
  rowId:       number
  operationId: string
  values:      Partial<AllocationRow>
}

interface FormStateStore {
  snapshot:          FormSnapshot | null
  pendingSuggestion: { field: keyof AllocationRow; value: string } | null

  publish:         (s: FormSnapshot) => void
  clear:           () => void
  suggestField:    (field: keyof AllocationRow, value: string) => void
  clearSuggestion: () => void
}

export const useFormStateStore = create<FormStateStore>((set) => ({
  snapshot:          null,
  pendingSuggestion: null,

  publish:         (snapshot) => set({ snapshot }),
  clear:           ()         => set({ snapshot: null, pendingSuggestion: null }),
  suggestField:    (field, value) => set({ pendingSuggestion: { field, value } }),
  clearSuggestion: ()             => set({ pendingSuggestion: null }),
}))
