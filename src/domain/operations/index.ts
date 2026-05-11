import type { OperationKind } from '../schemas'
import type { OperationHandler } from './_types'
import { createOrgHandler }            from './createOrg'
import { abolishOrgHandler }           from './abolishOrg'
import { hireHandler }                 from './hire'
import { moveToOrgHandler }            from './moveToOrg'
import { promoteHandler }              from './promote'
import { sendOnSecondmentHandler }     from './sendOnSecondment'
import { recallFromSecondmentHandler } from './recallFromSecondment'
import { addConcurrentHandler }          from './addConcurrent'
import { removeConcurrentHandler }       from './removeConcurrent'
import { createVacantPositionHandler }   from './createVacantPosition'
import { fillVacantPositionHandler }     from './fillVacantPosition'

// 新しい操作を追加するときはここに1行追加するだけ
const handlers: OperationHandler[] = [
  createOrgHandler,
  abolishOrgHandler,
  hireHandler,
  moveToOrgHandler,
  promoteHandler,
  sendOnSecondmentHandler,
  recallFromSecondmentHandler,
  addConcurrentHandler,
  removeConcurrentHandler,
  createVacantPositionHandler,
  fillVacantPositionHandler,
]

export const operationRegistry = new Map<OperationKind, OperationHandler>(
  handlers.map(h => [h.kind, h])
)

export type { OperationHandler } from './_types'
