import { useStore } from '../store/useStore'

export function PersonPanel() {
  const { persons, companies, organizations, selectedPersonId, beforeAffiliations, beforePositions, afterAffiliations, afterPositions, selectPerson } = useStore()

  const affectedPersonIds = selectedPersonId
    ? [selectedPersonId]
    : [...new Set([...beforeAffiliations, ...afterAffiliations].map(a => a.personId))]

  const getAffiliationDetails = (personId: string, affiliations: typeof beforeAffiliations, positions: typeof beforePositions) => {
    return affiliations
      .filter(a => a.personId === personId && a.status === 'active')
      .map(a => {
        const pos = positions.find(p => p.id === a.positionId)
        const org = organizations.find(o => o.id === pos?.orgId)
        const company = companies.find(c => c.id === pos?.companyId)
        const manager = persons.find(p => p.id === a.managerId)
        return { aff: a, pos, org, company, manager }
      })
      .filter(x => x.pos && x.org && x.company)
  }

  return (
    <div className="overflow-y-auto h-full">
      {affectedPersonIds.map(personId => {
        const person = persons.find(p => p.id === personId)
        if (!person) return null

        const beforeDetails = getAffiliationDetails(personId, beforeAffiliations, beforePositions)
        const afterDetails = getAffiliationDetails(personId, afterAffiliations, afterPositions)

        // Gather all company IDs present in before or after
        const allCompanyIds = [...new Set([
          ...beforeDetails.map(d => d.company!.id),
          ...afterDetails.map(d => d.company!.id),
        ])]

        return (
          <div key={personId} className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
            <div
              className="px-3 py-2 bg-gray-700 text-white text-sm font-semibold flex items-center justify-between cursor-pointer"
              onClick={() => selectPerson(selectedPersonId === personId ? personId : personId)}
            >
              <span>{person.name}</span>
              <span className="text-gray-300 text-xs">SF: {person.sfPersonId ?? '—'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1 text-left text-gray-500 w-16">会社</th>
                    <th className="px-2 py-1 text-left text-gray-500 border-l">Before</th>
                    <th className="px-2 py-1 text-left text-gray-500 border-l">After</th>
                    <th className="px-2 py-1 text-left text-gray-500 border-l w-20">変更</th>
                  </tr>
                </thead>
                <tbody>
                  {allCompanyIds.map(cid => {
                    const comp = companies.find(c => c.id === cid)
                    const before = beforeDetails.find(d => d.company!.id === cid)
                    const after = afterDetails.find(d => d.company!.id === cid)

                    const changed = !before ? '追加' : !after ? '終了' : (
                      before.org?.id !== after.org?.id || before.pos?.band !== after.pos?.band || before.pos?.title !== after.pos?.title
                    ) ? '変更' : null

                    return (
                      <tr key={cid} className={`border-t ${changed ? 'bg-yellow-50' : ''}`}>
                        <td className="px-2 py-2 font-medium text-gray-700">
                          {comp?.name}
                          {!comp?.hasSF && <div className="text-gray-400 text-xs">SF外</div>}
                        </td>
                        <td className="px-2 py-2 border-l">
                          {before ? (
                            <div>
                              <div className="font-medium text-gray-700">{before.org!.name}</div>
                              <div className="text-gray-500">{before.pos!.title} / {before.pos!.band}</div>
                              {before.manager && <div className="text-gray-400">上司: {before.manager.name}</div>}
                              <div className={`text-xs mt-0.5 ${before.aff.type === 'concurrent' ? 'text-purple-600' : 'text-blue-600'}`}>
                                {before.aff.type === 'concurrent' ? '兼務' : '本務'}
                              </div>
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-2 border-l">
                          {after ? (
                            <div>
                              <div className={`font-medium ${changed === '追加' ? 'text-green-700' : 'text-gray-700'}`}>{after.org!.name}</div>
                              <div className="text-gray-500">{after.pos!.title} / {after.pos!.band}</div>
                              {after.manager && <div className="text-gray-400">上司: {after.manager.name}</div>}
                              <div className={`text-xs mt-0.5 ${after.aff.type === 'concurrent' ? 'text-purple-600' : 'text-blue-600'}`}>
                                {after.aff.type === 'concurrent' ? '兼務' : '本務'}
                              </div>
                            </div>
                          ) : <span className="text-red-400">終了</span>}
                        </td>
                        <td className="px-2 py-2 border-l text-center">
                          {changed === '追加' && <span className="bg-green-100 text-green-700 px-1 rounded">追加</span>}
                          {changed === '終了' && <span className="bg-red-100 text-red-700 px-1 rounded">終了</span>}
                          {changed === '変更' && <span className="bg-yellow-100 text-yellow-700 px-1 rounded">変更</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
