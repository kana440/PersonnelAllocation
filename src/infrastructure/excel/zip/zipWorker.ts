// Web Worker: ZIP 圧縮処理をバックグラウンドで実行する
// main スレッドから { origBuffer, rows } を受け取り、結果バッファを返す。

import { buildZipBuffer } from './core'
import type { AllocationRow } from '../../allocationListMapper'

interface WorkerInput {
  origBuffer: ArrayBuffer
  rows: AllocationRow[]
}

addEventListener('message', async (e: MessageEvent<WorkerInput>) => {
  const { origBuffer, rows } = e.data
  try {
    const buffer = await buildZipBuffer(origBuffer, rows, pct => {
      postMessage({ type: 'progress', value: pct })
    })
    postMessage({ type: 'done', buffer })
  } catch (err) {
    postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
