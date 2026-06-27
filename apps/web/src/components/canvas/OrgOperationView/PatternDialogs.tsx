import { OrgTransferDialog }       from '../patternDialogs/OrgTransferDialog'
import { PromotionDialog }         from '../patternDialogs/PromotionDialog'
import { JobTypeDialog }           from '../patternDialogs/JobTypeDialog'
import { SecondmentReleaseDialog } from '../patternDialogs/SecondmentReleaseDialog'
import type { EditPattern }        from '@personnel/domain/patterns/editPattern'

interface Props {
  activePatternDialog: { pattern: EditPattern; rowId: number } | null
  onClose: () => void
}

export function PatternDialogs({ activePatternDialog, onClose }: Props) {
  if (!activePatternDialog) return null

  const { pattern, rowId } = activePatternDialog

  if (pattern === 'orgTransfer')
    return <OrgTransferDialog rowId={rowId} onClose={onClose} />

  if (pattern === 'promotion' || pattern === 'demotion')
    return <PromotionDialog rowId={rowId} onClose={onClose} />

  if (pattern === 'jobTypeChange')
    return <JobTypeDialog rowId={rowId} onClose={onClose} />

  if (pattern === 'secondmentOutRelease' || pattern === 'secondmentInRelease')
    return <SecondmentReleaseDialog rowId={rowId} onClose={onClose} />

  return null
}
