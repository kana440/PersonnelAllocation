import { OrgOperationView } from '../OrgOperationView'

/** メインキャンバスのみのレイアウトコンテナ（右パネルは廃止、左サイドバーに統合済み）。 */
export function CanvasLayout() {
  return (
    <div className="h-full overflow-hidden">
      <OrgOperationView />
    </div>
  )
}
