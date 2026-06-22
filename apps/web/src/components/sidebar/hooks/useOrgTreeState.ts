import { useState } from 'react'
import type { Organization } from '@personnel/domain/schemas'

export function useOrgTreeState(viewOrgs: Organization[]) {
  const [closedCompanies, setClosedCompanies] = useState<Set<string>>(new Set())
  const [expandedOrgIds, setExpandedOrgIds]   = useState<Set<string>>(new Set())

  const toggleCompany = (id: string) =>
    setClosedCompanies(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleOrg = (id: string) =>
    setExpandedOrgIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const expandToOrg = (orgId: string) => {
    const org = viewOrgs.find(o => o.id === orgId)
    if (!org) return
    if (org.companyId)
      setClosedCompanies(prev => { const s = new Set(prev); s.delete(org.companyId!); return s })
    setExpandedOrgIds(prev => {
      const s = new Set(prev)
      s.add(orgId)
      let cur: Organization | undefined = org
      while (cur?.parentId) {
        cur = viewOrgs.find(o => o.id === cur!.parentId)
        if (cur) s.add(cur.id)
      }
      return s
    })
  }

  return { closedCompanies, toggleCompany, expandedOrgIds, toggleOrg, expandToOrg }
}
