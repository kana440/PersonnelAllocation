/**
 * row/index.ts — ROW_RULES への登録
 *
 * 新しい RowRule を追加するときはこのファイルに import + push するだけ。
 * 各ルールファイルは ROW_RULES を直接参照しない（循環 import を防ぐ）。
 */

import { ROW_RULES } from '../rowRule'
import { CORRELATION_RULES }        from './correlation'
import { GLOBAL_CONSISTENCY_RULES } from './consistency'

ROW_RULES.push(
  ...CORRELATION_RULES,         // C1〜C4: 相関チェック（組織マスタ整合性・組合フラグ）
  ...GLOBAL_CONSISTENCY_RULES,  // W2: 2段階昇降格ワーニング
)
