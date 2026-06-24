import { useEffect, useRef } from 'react'

/**
 * 指定した要素群の外側でクリック（mousedown）が発生したときにハンドラを呼ぶ。
 * - 複数 ref を渡した場合、いずれかの内側ならハンドラを呼ばない
 * - enabled=false のときはリスナーを登録しない（open フラグと連動させることで不要な処理を省く）
 * - ハンドラは useRef で安定化しているため、毎レンダーの変化で listener が再登録されない
 */
export function useClickOutside(
  refs:    React.RefObject<Element | null>[],
  handler: () => void,
  enabled = true,
) {
  const stableHandler = useRef(handler)
  useEffect(() => { stableHandler.current = handler })

  useEffect(() => {
    if (!enabled) return
    const listener = (e: MouseEvent) => {
      const target = e.target as Node
      if (refs.every(r => !r.current?.contains(target))) {
        stableHandler.current()
      }
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
    // refs は安定した ref オブジェクトなので deps から省略する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
