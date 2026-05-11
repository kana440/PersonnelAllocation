import type { OperationHandler } from './_types'

export const abolishOrgHandler: OperationHandler = {
  kind: 'AbolishOrg',

  apply(state, op) {
    const { orgId } = op.params
    state.organizations = state.organizations.map(o =>
      o.id === orgId ? { ...o, isAbandoned: true } : o
    )
  },
}
