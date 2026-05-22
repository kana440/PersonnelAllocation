export interface PersonInfo {
  userId: string
  name: string
  orgName?: string
  rowIds: number[]
}

export interface PersonMatch {
  userId: string
  name: string
  currentOrgName?: string
  rowId: number
  currentGrade?: string
  currentPosition?: string
}

export type ChatWidget =
  | { type: 'file-picker' }
  | { type: 'excel-help' }
  | { type: 'org-input' }
  | { type: 'person-input' }
  | { type: 'org-members'; orgName: string; members: PersonInfo[] }
  | { type: 'promote-confirm'; persons: PersonMatch[] }

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  widget?: ChatWidget
  isLoading?: boolean
}

export interface WidgetCallbacks {
  onFileSelected: (file: File) => void
  onOrgNameSubmit: (name: string) => void
  onPersonNamesSubmit: (names: string) => void
  onPromoteConfirm: () => void
  onPromoteCancel: () => void
}
