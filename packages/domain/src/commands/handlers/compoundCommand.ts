import type { EditCommand } from '../types'
import type { OperationResult, ValidationResult } from '../types'
import type { DomainContext } from '../types'
import { ok } from '../types'

export class CompoundCommand implements EditCommand {
  readonly kind = 'compound'

  constructor(
    private readonly subCommands: readonly EditCommand[],
    private readonly labelStr: string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    let currentCtx = ctx
    for (const cmd of this.subCommands) {
      const vr = cmd.validate(currentCtx)
      if (!vr.ok) return vr
      const result = cmd.apply(currentCtx)
      currentCtx = {
        ...currentCtx,
        allocationList:     result.updatedList,
        afterOrganizations: result.updatedOrgs ?? currentCtx.afterOrganizations,
      }
    }
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    let currentCtx = ctx
    for (const cmd of this.subCommands) {
      const result = cmd.apply(currentCtx)
      currentCtx = {
        ...currentCtx,
        allocationList:     result.updatedList,
        afterOrganizations: result.updatedOrgs ?? currentCtx.afterOrganizations,
      }
    }
    return {
      updatedList: currentCtx.allocationList,
      updatedOrgs: currentCtx.afterOrganizations !== ctx.afterOrganizations
        ? currentCtx.afterOrganizations
        : undefined,
      label: this.labelStr,
    }
  }
}
