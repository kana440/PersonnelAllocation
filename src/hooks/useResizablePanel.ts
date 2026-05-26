import { useCallback, useRef, useState } from 'react'

/**
 * ドラッグ操作でパネルサイズを変更するフック。
 * axis='x' は横幅、'y' は縦高さ。
 * invert=true はドラッグ方向を逆にする（右端ハンドルを左ドラッグで拡大、など）。
 */
export function useResizablePanel(
  defaultSize: number,
  options: { min: number; max: number | (() => number); axis: 'x' | 'y'; invert?: boolean }
): [number, React.Dispatch<React.SetStateAction<number>>, (e: React.MouseEvent) => void] {
  const { min, max, axis, invert = false } = options
  const [size, setSize] = useState(defaultSize)
  const sizeRef = useRef(defaultSize)
  sizeRef.current = size

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startPos  = axis === 'x' ? e.clientX : e.clientY
    const startSize = sizeRef.current

    const onMove = (ev: MouseEvent) => {
      const curr    = axis === 'x' ? ev.clientX : ev.clientY
      const raw     = curr - startPos
      const delta   = invert ? -raw : raw
      const maxVal  = typeof max === 'function' ? max() : max
      setSize(Math.max(min, Math.min(maxVal, startSize + delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [min, max, axis, invert])

  return [size, setSize, handleMouseDown]
}
