/**
 * interRow/index.ts — INTER_ROW_RULES への登録
 *
 * 新しい InterRowRule を追加するときはこのファイルに import + push するだけ。
 * 各ルールファイルは INTER_ROW_RULES を直接参照しない（循環 import を防ぐ）。
 */

import { INTER_ROW_RULES } from '../interRowRule'
import { managerChainRule } from './managerChain'
import { managerOrgRule }   from './managerOrg'
import { positionUniqRule } from './positionUniq'

INTER_ROW_RULES.push(
  managerChainRule,  // E1: 上司ポジション存在・自己参照・循環
  positionUniqRule,  // E2: positionCode 重複
  managerOrgRule,    // W3: 上司が直系上位組織以外に所属
)
