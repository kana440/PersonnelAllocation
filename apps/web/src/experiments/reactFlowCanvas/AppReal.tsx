import { useEffect, useState } from 'react'
import { generateSyntheticData } from './syntheticData'
import { loadSyntheticIntoStore } from './loadIntoStore'
import { RealCanvas } from './RealCanvas'

const ORG_COUNT = 2000
const ROW_COUNT = 30000

// 'loading-data'    : 合成データ生成＋store注入（非同期）
// 'ready-to-render' : 注入完了。ここで一度ローダーを描画確定させてから重い RealCanvas に進む
// 'rendering'       : RealCanvas を実際にマウントする（useOrgViewData 等の重い同期計算が走る）
type Phase = 'loading-data' | 'ready-to-render' | 'rendering'

export function AppReal() {
  const [phase, setPhase] = useState<Phase>('loading-data')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const t0 = performance.now()
      const { orgs, rows } = generateSyntheticData(ORG_COUNT, ROW_COUNT)
      const t1 = performance.now()
      await loadSyntheticIntoStore(orgs, rows)
      const t2 = performance.now()
      // eslint-disable-next-line no-console
      console.log(`[perf] Phase1 synthetic data gen: ${(t1 - t0).toFixed(1)}ms / store注入(appService): ${(t2 - t1).toFixed(1)}ms`)
      if (!cancelled) setPhase('ready-to-render')
    })()
    return () => { cancelled = true }
  }, [])

  // 'ready-to-render' のローダーが実際に1フレーム分ペイントされてから
  // 'rendering' に切り替える（RealCanvas の重い同期計算の直前にブラウザへ描画の猶予を与える）。
  // これが無いと「ローダーが消えた瞬間に重い計算が始まり、何も描かれないまま数秒固まる」ように見える。
  useEffect(() => {
    if (phase !== 'ready-to-render') return
    const raf = requestAnimationFrame(() => setPhase('rendering'))
    return () => cancelAnimationFrame(raf)
  }, [phase])

  if (phase !== 'rendering') {
    const message = phase === 'loading-data' ? '合成データを本物の store に注入中...' : '組織図を構築中...'
    return <div style={{ padding: 20 }}>{message}</div>
  }

  return <RealCanvas />
}
