// Domain operation abstraction.
// validate() and apply() are both pure functions — no side effects.
// Excel backward compatibility is maintained here:
// apply() always returns AllocationRow[] with the same prev*/after column structure.
// HRApplicationService.executeOperation() is the single execution entry point.
//
// To add a new operation kind:
//   1. Implement EditCommand in src/domain/operation/handlers/
//   2. Pass an instance to HRApplicationService.executeOperation() — no registry needed

import type { AllocationRow } from '../allocationRow'
import type { Organization }  from '../schemas'
import type { AllCodeLists }  from '../codeLists/aggregate'

// ── Validation result ────────────────────────────────────────────────────────

export type ValidationOk    = { ok: true }
export type ValidationError = { ok: false; errors: OperationError[] }
export type ValidationResult = ValidationOk | ValidationError

export interface OperationError {
  field?:  string
  message: string
}

// ── Context passed to validate() and apply() ────────────────────────────────

export interface OperationContext {
  readonly allocationList:     AllocationRow[]
  readonly afterOrganizations: Organization[]
  readonly codeLists:          AllCodeLists
}

// ── Result returned by apply() ───────────────────────────────────────────────

export interface OperationResult {
  updatedList: AllocationRow[]
  updatedOrgs?: Organization[]  // only set by CreateOrg/AbolishOrg operations
  label: string                 // human-readable label for undo stack
}

// ── Operation interface ──────────────────────────────────────────────────────

export interface EditCommand {
  readonly kind: string

  // Pure function: checks whether this operation is valid against current state.
  // Called by executeOperation() before apply().
  validate(ctx: OperationContext): ValidationResult

  // Pure function: returns the new state. Called only after validate() returns ok.
  apply(ctx: OperationContext): OperationResult
}

// ── Result constructors ──────────────────────────────────────────────────────

export function ok(): ValidationOk {
  return { ok: true }
}

export function fail(...messages: string[]): ValidationError {
  return { ok: false, errors: messages.map(message => ({ message })) }
}

export function failField(field: string, message: string): ValidationError {
  return { ok: false, errors: [{ field, message }] }
}
