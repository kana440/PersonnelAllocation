interface Props {
  selectedCount:     number
  approvableCount:   number
  remaining:         number
  canRelease:        boolean
  onApproveSelected: () => void
  onRejectSelected:  () => void
  onReturnSelected:  () => void
  onApproveAll:      () => void
  onDiscard:         () => void
  onRelease:         () => void
}

export function MergeReviewFooter({
  selectedCount, approvableCount, remaining, canRelease,
  onApproveSelected, onRejectSelected, onReturnSelected, onApproveAll, onDiscard, onRelease,
}: Props) {
  return (
    <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400">{selectedCount} 件選択中</span>
      <button
        onClick={onApproveSelected}
        disabled={approvableCount === 0}
        className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title="選択した行を承認する（追加・変更行は実データに反映、消えた行は確認のみ）"
      >
        承認
      </button>
      <button
        onClick={onReturnSelected}
        disabled={approvableCount === 0}
        className="px-3 py-1.5 rounded text-xs border border-amber-400 text-amber-700 hover:bg-amber-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title="担当者に再提出を依頼する（データ変更なし。履歴に担当者名付きで記録される）"
      >
        差し戻し
      </button>
      <button
        onClick={onRejectSelected}
        disabled={approvableCount === 0}
        className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title="取り込まない（再提出も求めない）。データ変更なし"
      >
        却下
      </button>
      <span className="text-gray-200">|</span>
      <button
        onClick={onApproveAll}
        disabled={remaining === 0}
        className="px-3 py-1.5 rounded text-xs border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title="残りの未処理行をすべて承認する"
      >
        残り{remaining}件をすべて承認
      </button>
      <button
        onClick={onDiscard}
        className="px-3 py-1.5 rounded text-xs border border-red-300 text-red-600 hover:bg-red-50 font-medium"
        title="このマージ/リベースのレビューを破棄し、開始時点の状態に完全に戻す（承認済みの変更も含めてロールバックされる）"
      >
        このレビューを破棄
      </button>
      <button
        onClick={onRelease}
        disabled={!canRelease}
        className="ml-auto px-4 py-1.5 rounded text-xs bg-gray-800 text-white hover:bg-gray-900 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title={canRelease ? undefined : 'すべての行を承認/却下/差し戻しするとリリースできます'}
      >
        リリース
      </button>
    </div>
  )
}
