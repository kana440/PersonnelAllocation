import type { OperationHandler } from './_types'

export const createOrgHandler: OperationHandler = {
  kind: 'CreateOrg',

  apply(state, op) {
    const { id, name, companyId, parentId, level } = op.params
    if (!state.organizations.find(o => o.id === id)) {
      state.organizations = [
        ...state.organizations,
        { id, name, companyId, parentId: parentId || null, level: parseInt(level) || 3 },
      ]
    }
  },
}
