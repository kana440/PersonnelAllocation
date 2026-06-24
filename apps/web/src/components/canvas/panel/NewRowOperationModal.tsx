import { useState } from 'react'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { useStore } from '../../../store/useStore'
import { OperationFormView } from '../../editor/PersonOperationPanel/OperationFormView'
import { SecondmentInGuide, ConcurrentSecondmentInGuide } from './SecondmentInGuide'

// ガイド画面を先に表示する操作 ID
const GUIDED_DEF_IDS = new Set(['SecondmentInNew', 'ConcurrentSecondmentInNew'])

interface Props {
  def:      EditOperation
  /** 追加先組織の departmentCode（SF externalCode） */
  orgCode:  string
  onClose:  () => void
}

// モーダルシェル — トップレベル関数として定義することで毎レンダーの再マウントを防ぐ
interface ShellProps {
  title:        string
  onClose:      () => void
  onBackToGuide?: () => void
  children:     React.ReactNode
}

function ModalShell({ title, onClose, onBackToGuide, children }: ShellProps) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center select-text"
      onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center px-3 py-2 border-b border-gray-200 bg-blue-50 rounded-t-xl">
          <span className="flex-1 text-[11px] font-semibold text-blue-700">{title}</span>
          {onBackToGuide && (
            <button
              onClick={onBackToGuide}
              className="mr-2 text-[9px] text-blue-500 hover:text-blue-700 underline"
            >← ガイドに戻る</button>
          )}
          <button
            onClick={onClose}
            className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors text-xs"
            title="閉じる"
          >✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * 組織パネルの追加ボタンから新規行を作成するモーダル。
 * 出向受入系（SecondmentInNew / ConcurrentSecondmentInNew）はガイド画面を先に表示し、
 * 「入力フォームへ」後に OperationFormView に遷移する。
 */
export function NewRowOperationModal({ def, orgCode, onClose }: Props) {
  const [step, setStep] = useState<'guide' | 'form'>(() =>
    GUIDED_DEF_IDS.has(def.id) ? 'guide' : 'form'
  )

  const { afterOrganizations } = useStore()
  const orgName = afterOrganizations.find(
    o => o.externalCode === orgCode || o.id === orgCode
  )?.name ?? ''

  // 合成行: departmentCode だけ設定。onOpen が組織コードを初期値として拾う
  const syntheticRow = { rowId: -1, departmentCode: orgCode } as AllocationRow

  const isGuided = GUIDED_DEF_IDS.has(def.id)

  if (step === 'guide' && def.id === 'SecondmentInNew') {
    return (
      <ModalShell title={def.label} onClose={onClose}>
        <SecondmentInGuide
          orgName={orgName}
          onNext={() => setStep('form')}
          onClose={onClose}
        />
      </ModalShell>
    )
  }

  if (step === 'guide' && def.id === 'ConcurrentSecondmentInNew') {
    return (
      <ModalShell title={def.label} onClose={onClose}>
        <ConcurrentSecondmentInGuide
          orgName={orgName}
          onNext={() => setStep('form')}
          onClose={onClose}
        />
      </ModalShell>
    )
  }

  return (
    <ModalShell
      title={def.label}
      onClose={onClose}
      onBackToGuide={isGuided ? () => setStep('guide') : undefined}
    >
      <OperationFormView def={def} row={syntheticRow} onBack={onClose} />
    </ModalShell>
  )
}
