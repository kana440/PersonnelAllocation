// AI tool functions for Claude Tool Use integration.
//
// Design principles: specs/G4-ai/00-design-philosophy.md
//
// Usage (production):
//   import { aiTools } from './aiTools'
//   aiTools.findPersons({ name: '田中' })
//
// Usage (test):
//   const svc = new HRApplicationService()
//   svc.loadExcelData(mockData)
//   const tools = createAITools(svc)
//   tools.findPersons({ name: '田中' })

import { HRApplicationService, appService } from '../HRApplicationService'
import { createReadMethods }     from './read'
import { createWriteMethods }    from './write'
import { createReviewMethods }   from './review'
import { createDiagnoseMethods } from './diagnose'

export type { VacantPositionResult, AIOperationResult, PersonSearchResult, PersonResult, PersonRowDetail } from './types'
export type { DiagnosePersonChangesResult, PatternDiagnosis }                                            from './diagnose'
export { buildOrgTree } from './orgTree'

export function createAITools(service: HRApplicationService) {
  return {
    ...createReadMethods(service),
    ...createWriteMethods(service),
    ...createReviewMethods(service),
    ...createDiagnoseMethods(service),
  }
}

export const aiTools = createAITools(appService)
export type AITools = ReturnType<typeof createAITools>
