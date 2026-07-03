// ResizeObserver コールバックを1フレームにバッチして setPanelHeight の呼び出し回数を削減する。
// 同一フレーム内で複数パネルが高さ変化した場合、rAF 内で全更新をまとめて実行する。
// React 18 の自動バッチングにより、rAF コールバック内の N 回の set 呼び出しは1回の再レンダーにまとめられる。

const pending = new Map<string, number>()
let rafId: number | null = null
let flushFn: ((panelId: string, height: number) => void) | null = null

export function scheduleHeightUpdate(
  panelId: string,
  height: number,
  setPanelHeight: (panelId: string, height: number) => void,
): void {
  pending.set(panelId, height)
  flushFn = setPanelHeight
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    const fn = flushFn!
    for (const [id, h] of pending) fn(id, h)
    pending.clear()
    rafId = null
    flushFn = null
  })
}
