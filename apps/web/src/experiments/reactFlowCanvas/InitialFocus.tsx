import { useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'

interface Props {
  nodeIds: string[]
}

/**
 * マウント時に一度だけ、指定ノード（通常はルート組織）だけに fitView する。
 * 全ノードに fitView すると画面外ノードが無くなり onlyRenderVisibleElements が無効化されるため、
 * 対象を絞ってフィットすることで「初期表示は少数だけ見える」状態を確実に作る。
 */
export function InitialFocus({ nodeIds }: Props) {
  const { fitView } = useReactFlow()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || nodeIds.length === 0) return
    done.current = true
    // ノードの実測（幅/高さ）が反映されるよう1フレーム待ってから fit する
    requestAnimationFrame(() => {
      fitView({ nodes: nodeIds.map(id => ({ id })), duration: 0, padding: 2, maxZoom: 1 })
    })
  }, [nodeIds, fitView])

  return null
}
