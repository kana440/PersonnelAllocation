import { useCanvasDisplayStore } from '../store/canvasDisplayStore'
import { resolveFieldStrictness, type FieldStrictness, type UnavailableOperationDisplay } from '../domain/optionStrictness'

/** フィールドの strictness をユーザーオーバーライド込みで返す */
export function useFieldStrictness(field: string): FieldStrictness {
  const overrides = useCanvasDisplayStore(s => s.fieldStrictnessOverrides)
  return resolveFieldStrictness(field, overrides)
}

/** フィールド群の overrides を1オブジェクトとして返す（ダイアログでまとめて使う用） */
export function useFieldStrictnessOverrides(): Partial<Record<string, FieldStrictness>> {
  return useCanvasDisplayStore(s => s.fieldStrictnessOverrides)
}

/** 非該当操作の表示モード（LocalStorage保存済みユーザー設定 or ドメインデフォルト） */
export function useUnavailableOperationDisplay(): UnavailableOperationDisplay {
  return useCanvasDisplayStore(s => s.unavailableOperationDisplay)
}
