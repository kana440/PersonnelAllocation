import { useCanvasDisplayStore } from '../store/canvasDisplayStore'
import type { UnavailableOperationDisplay } from '@personnel/domain/optionStrictness'

/** 非該当操作の表示モード（LocalStorage保存済みユーザー設定 or ドメインデフォルト） */
export function useUnavailableOperationDisplay(): UnavailableOperationDisplay {
  return useCanvasDisplayStore(s => s.unavailableOperationDisplay)
}
