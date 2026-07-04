import { UnifiedReviewView } from '../review/UnifiedReviewView'

export function ReviewPane() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <UnifiedReviewView />
    </div>
  )
}
