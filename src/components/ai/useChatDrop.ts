import { useState } from 'react'
import { useChatStore } from '../../store/useChatStore'

/**
 * チャットドロワーへのドラッグ&ドロップ処理。
 * ドラッグデータの `rowId` フィールドを読んでコンテキストに追加する。
 * DragData の fromRowId ではなく統一フィールド rowId を使うこと。
 */
export function useChatDrop() {
  const { addToChatContext } = useChatStore()
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  // 子要素への移動でも dragLeave が発火するため relatedTarget で判定
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (typeof data.rowId === 'number') addToChatContext(data.rowId)
    } catch {
      // 無効なデータは無視
    }
  }

  return { isDragOver, handleDragOver, handleDragLeave, handleDrop }
}
