import { BeforeTreeWindowCanvas } from './before/BeforeTreeWindowCanvas'
import { TreeWindowCanvas }       from './TreeWindowCanvas'

/**
 * 比較モード用スプリットビュー
 * 左: 旧組織キャンバス — 新組織と同じツリーウィンドウ形式・読み取り専用・人を複数選択可
 * 右: 新組織キャンバス — タイトルバーがドロップ受け口（org-mapping）
 */
export function ComparisonSplitView() {
  return (
    <div className="flex h-full">
      {/* 左ペイン: 旧組織キャンバス（読み取り専用） */}
      <div className="w-1/2 border-r-2 border-stone-300 overflow-hidden flex flex-col">
        <BeforeTreeWindowCanvas />
      </div>

      {/* 右ペイン: 新組織キャンバス */}
      <div className="w-1/2 overflow-hidden flex flex-col">
        <TreeWindowCanvas />
      </div>
    </div>
  )
}
