import type { WizardStep } from '../../../application/aiTypes'
import { DiffTable } from '../../shared/DiffTable'

interface Props {
  title:     string
  steps:     WizardStep[]
  isActive:  boolean
  onConfirm: () => void
  onCancel:  () => void
}

export function WizardStepsWidget({ title, steps, isActive, onConfirm, onCancel }: Props) {
  return (
    <div className="mt-2 border border-indigo-200 rounded-xl overflow-hidden">
      <div className="px-3 pt-2.5 pb-1.5 bg-indigo-50 border-b border-indigo-100">
        <p className="text-xs font-semibold text-indigo-700">{title}</p>
        <p className="text-[11px] text-indigo-500 mt-0.5">
          {steps.length}ステップの操作 — すべて確認の上、一括実行できます
        </p>
      </div>

      <div className="px-3 py-3 space-y-0">
        {steps.map((step, i) => (
          <StepCard key={step.stepNumber} step={step} isLast={i === steps.length - 1} />
        ))}
      </div>

      {isActive && (
        <div className="bg-indigo-50 px-3 py-2.5 flex gap-2 border-t border-indigo-100">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            すべてのステップを実行
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  )
}

function StepCard({ step, isLast }: { step: WizardStep; isLast: boolean }) {
  const showOrgColumn = step.diffs.some(
    d => d.before.orgName !== d.after.orgName && (d.before.orgName || d.after.orgName)
  )
  return (
    <div className="flex gap-2">
      {/* Connector column */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
          {step.stepNumber}
        </div>
        {!isLast && <div className="w-px flex-1 bg-indigo-200 my-1" />}
      </div>

      {/* Step content */}
      <div className={`flex-1 min-w-0 ${isLast ? 'pb-1' : 'pb-4'}`}>
        <p className="text-xs font-semibold text-gray-700 mb-0.5">{step.title}</p>
        {step.description && (
          <p className="text-[11px] text-gray-500 mb-1.5 leading-relaxed">{step.description}</p>
        )}
        {step.diffs.length > 0 && (
          <div className="rounded-lg border border-gray-100 overflow-hidden">
            <DiffTable diffs={step.diffs} showOrgColumn={showOrgColumn} />
          </div>
        )}
      </div>
    </div>
  )
}
