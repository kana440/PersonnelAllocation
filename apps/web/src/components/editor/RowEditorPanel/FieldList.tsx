import { Fragment } from 'react'
import { RowEditorField } from '../RowEditorField'
import { ManagerPositionRow } from '../ManagerPositionRow'
import { BooleanFieldRow } from './BooleanFieldRow'
import { OrgEditorRow } from './OrgEditorRow'
import {
  EDITOR_FIELD_ORDER, BEFORE_KEY_FOR, FIELD_LABEL,
  BOOLEAN_1_FIELDS, MANAGER_POS_FIELDS, ORG_FIELDS, READONLY_FIELDS,
  getOptions,
} from './helpers'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { Organization } from '@personnel/domain/schemas'
import type { ValidationIssue } from '@personnel/domain/rules/validate/validateRow'

interface Props {
  effectiveRow:        AllocationRow
  savedRow:            AllocationRow
  issues:              ValidationIssue[]
  allocationList:      AllocationRow[]
  afterOrganizations:  Organization[]
  masters:           AllMasters
  readOnly:            boolean
  currentJobFamily:    string
  onChange:            (key: keyof AllocationRow, value: string) => void
  onManagerChange:     (posCode: string, managerName?: string) => void
  onOrgChange:         (key: string, code: string, batch: Record<string, string>) => void
}

export function FieldList({
  effectiveRow, savedRow, issues,
  allocationList, afterOrganizations, masters,
  readOnly, currentJobFamily,
  onChange, onManagerChange, onOrgChange,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      {EDITOR_FIELD_ORDER.map(key => {
        const prevKey     = BEFORE_KEY_FOR[key]
        if (!prevKey) return null
        const afterKey    = key as keyof AllocationRow
        const afterStr    = (effectiveRow[afterKey] as string | undefined) ?? ''
        const prevStr     = (savedRow[prevKey as keyof AllocationRow] as string | undefined) ?? ''
        const isReadOnly  = READONLY_FIELDS.has(key) || readOnly
        const fieldIssues = issues.filter(i => i.field === afterKey)

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
          const managerName = (effectiveRow.managerName as string | undefined) ?? ''
          return (
            <ManagerPositionRow
              key={key}
              label={FIELD_LABEL[key] ?? key}
              value={afterStr}
              prevVal={prevStr}
              associatedName={managerName}
              afterOrganizations={afterOrganizations}
              allRows={allocationList}
              issues={fieldIssues}
              readOnly={isReadOnly}
              onChange={onManagerChange}
            />
          )
        }

        if (ORG_FIELDS.has(key)) {
          return (
            <OrgEditorRow
              key={key}
              label={FIELD_LABEL[key] ?? key}
              code={afterStr}
              prevVal={prevStr}
              afterOrganizations={afterOrganizations}
              orgMasterEntries={masters.orgMasterEntries}
              relatedValues={{
                businessUnit: (effectiveRow.businessUnit as string | undefined),
                division:     (effectiveRow.division     as string | undefined),
                subDivision:  (effectiveRow.subDivision  as string | undefined),
                group:        (effectiveRow.group        as string | undefined),
                team:         (effectiveRow.team         as string | undefined),
              }}
              issues={fieldIssues}
              readOnly={isReadOnly}
              onCodeChange={code => onOrgChange(key, code, { [key]: code })}
              onBatchChange={batch => onOrgChange(key, batch.departmentCode ?? '', batch)}
            />
          )
        }

        const { valid, invalid } = getOptions(key, masters, currentJobFamily, effectiveRow)
        return (
          <Fragment key={key}>
            <RowEditorField
              label={FIELD_LABEL[key] ?? key}
              afterVal={afterStr}
              beforeVal={prevStr}
              onChange={v => onChange(afterKey, v)}
              options={valid}
              invalidOptions={invalid}
              strictness={invalid.length > 0 ? 'guide' : 'free'}
              issues={fieldIssues}
              readOnly={isReadOnly}
            />
          </Fragment>
        )
      })}

      {issues.length === 0 && (
        <div className="text-xs text-gray-400 text-center py-8">
          バリデーション問題はありません
        </div>
      )}
    </div>
  )
}
