import { RowEditorField } from '../RowEditorField'
import { ManagerPositionRow } from '../ManagerPositionRow'
import { BooleanFieldRow } from './BooleanFieldRow'
import { OrgEditorRow } from './OrgEditorRow'
import {
  EDITOR_FIELD_ORDER, BEFORE_KEY_FOR, FIELD_LABEL,
  BOOLEAN_1_FIELDS, MANAGER_POS_FIELDS, ORG_FIELDS, READONLY_FIELDS,
  getOptions,
} from './helpers'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { AllCodeLists } from '../../../domain/codeLists/aggregate'
import type { Organization } from '../../../domain/schemas'
import type { ValidationIssue } from '../../../domain/validation/validateRow'

interface Props {
  effectiveRow:      AllocationRow
  savedRow:          AllocationRow
  issues:            ValidationIssue[]
  showAll:           boolean
  defaultFields:     Set<string>
  allocationList:    AllocationRow[]
  afterOrganizations: Organization[]
  codeLists:         AllCodeLists
  readOnly:          boolean
  currentJobFamily:  string
  onChange:          (key: keyof AllocationRow, value: string) => void
  onManagerChange:   (posCode: string, managerName: string) => void
  onOrgChange:       (key: string, code: string, batch: Record<string, string>) => void
}

export function FieldList({
  effectiveRow, savedRow, issues, showAll, defaultFields,
  allocationList, afterOrganizations, codeLists,
  readOnly, currentJobFamily,
  onChange, onManagerChange, onOrgChange,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      {EDITOR_FIELD_ORDER.map(key => {
        const prevKey    = BEFORE_KEY_FOR[key]
        if (!prevKey) return null
        const afterKey   = key as keyof AllocationRow
        const afterStr   = (effectiveRow[afterKey] as string | undefined) ?? ''
        const prevStr    = (savedRow[prevKey as keyof AllocationRow] as string | undefined) ?? ''
        const isReadOnly = READONLY_FIELDS.has(key) || readOnly
        const fieldIssues = issues.filter(i => i.field === afterKey)

        if (!showAll && !defaultFields.has(key)) return null

        if (BOOLEAN_1_FIELDS.has(key)) {
          return (
            <BooleanFieldRow
              key={key}
              label={FIELD_LABEL[key] ?? key}
              afterVal={afterStr}
              prevVal={prevStr}
              issues={fieldIssues}
              readOnly={isReadOnly}
              onChange={v => onChange(afterKey, v)}
            />
          )
        }

        if (MANAGER_POS_FIELDS.has(key)) {
          return (
            <ManagerPositionRow
              key={key}
              label={FIELD_LABEL[key] ?? key}
              value={afterStr}
              prevVal={prevStr}
              allRows={allocationList}
              issues={fieldIssues}
              readOnly={isReadOnly}
              onChange={onManagerChange}
            />
          )
        }

        if (ORG_FIELDS.has(key)) {
          const orgId = afterOrganizations.find(o => o.externalCode === afterStr)?.id ?? null
          return (
            <OrgEditorRow
              key={key}
              label={FIELD_LABEL[key] ?? key}
              orgId={orgId}
              prevVal={prevStr}
              orgs={afterOrganizations}
              issues={fieldIssues}
              readOnly={isReadOnly}
              onChange={id => {
                const org   = afterOrganizations.find(o => o.id === id)
                const code  = org?.externalCode ?? ''
                const entry = codeLists.orgMasterEntries.find(e => e.code === code && e.phase === 'after')
                           ?? codeLists.orgMasterEntries.find(e => e.code === code)
                const batch: Record<string, string> = { [key]: code }
                if (entry) {
                  batch.businessUnit = entry.businessUnit
                  batch.division     = entry.division
                  batch.subDivision  = entry.department   // OrgMasterEntry.department → subDivision
                  batch.group        = entry.group
                  batch.team         = entry.team
                }
                onOrgChange(key, code, batch)
              }}
            />
          )
        }

        return (
          <RowEditorField
            key={key}
            label={FIELD_LABEL[key] ?? key}
            afterVal={afterStr}
            beforeVal={prevStr}
            onChange={v => onChange(afterKey, v)}
            options={getOptions(key, codeLists, currentJobFamily)}
            issues={fieldIssues}
            readOnly={isReadOnly}
          />
        )
      })}

      {issues.length === 0 && !showAll && defaultFields.size === 0 && (
        <div className="text-xs text-gray-400 text-center py-8">
          発令前後の差分がありません。「変更のみ」を解除すると全フィールドを確認できます。
        </div>
      )}
    </div>
  )
}
