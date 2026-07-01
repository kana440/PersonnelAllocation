import type { StepMode } from '@personnel/domain/choices'

export type { StepMode } from '@personnel/domain/choices'
export { filterBandsByStep } from '@personnel/domain/choices'

interface Props {
  mode:      StepMode
  direction: 'up' | 'down'
  onChange:  (mode: StepMode) => void
}

export function BandStepFilter({ mode, direction, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <span className="text-[10px] text-gray-400 mr-0.5">変更幅:</span>
      {(['1', '2', 'all'] as const).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            mode === m
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-300 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {m === 'all' ? '全て' : `${m}段階${direction === 'up' ? '上' : '下'}`}
        </button>
      ))}
    </div>
  )
}
