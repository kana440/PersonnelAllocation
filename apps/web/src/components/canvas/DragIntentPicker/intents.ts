import {
  orgTransferDef,
} from '@personnel/domain/commands/defs/orgTransferDefs'
import {
  secondmentOutSFDef, secondmentOutNonSFDef,
  secondmentOutReleaseSFDef, secondmentOutReleaseNonSFDef,
} from '@personnel/domain/commands/defs/secondmentDefs'
import { concurrentAddDef }  from '@personnel/domain/commands/defs/concurrentDefs'
import { managerChangeDef }  from '@personnel/domain/commands/defs/positionAddDef'
import type { EditOperation } from '@personnel/domain/commands/defs/index'

export interface IntentDef {
  readonly def:            EditOperation
  readonly title:          string
  readonly desc:           string
  readonly border:         string
  readonly badge:          string
  readonly icon:           string
  readonly usePrimaryOnly: boolean
}

// ── 異なる組織への異動インテント ─────────────────────────────────────────────
export const TRANSFER_INTENTS: readonly IntentDef[] = [
  {
    def:   orgTransferDef,
    title: '業務変更による異動',
    desc:  '担当業務の変更・本人都合などにより、在籍部署が変わる場合。別組織への通常異動。',
    border: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
    badge:  'bg-blue-100 text-blue-700',
    icon:   '👤',
    usePrimaryOnly: false,
  },
  {
    def:   concurrentAddDef,
    title: '兼務追加',
    desc:  '本務を維持したまま、この組織に兼務を追加する。本務行をベースに兼務行が新たに作成されます。',
    border: 'border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50',
    badge:  'bg-cyan-100 text-cyan-700',
    icon:   '📋',
    usePrimaryOnly: true,
  },
]

// ── 本務出向解除インテント（出向者用組織 → 通常） ──────────────────────────
export const SECONDMENT_RELEASE_INTENTS: readonly IntentDef[] = [
  {
    def:   secondmentOutReleaseSFDef,
    title: '本務出向解除（SF統合先）',
    desc:  '出向元が SuccessFactors 統合先の場合の出向解除。戻り先組織コードが自動設定されます。',
    border: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50',
    badge:  'bg-orange-100 text-orange-700',
    icon:   '↩️',
    usePrimaryOnly: false,
  },
  {
    def:   secondmentOutReleaseNonSFDef,
    title: '本務出向解除（SF未導入先）',
    desc:  '出向元が SuccessFactors 未導入の場合の出向解除。戻り先組織コードは任意入力です。',
    border: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50',
    badge:  'bg-amber-100 text-amber-700',
    icon:   '↩️',
    usePrimaryOnly: false,
  },
]

// ── 同一組織内のインテント ──────────────────────────────────────────────────
export const SAME_ORG_INTENTS: readonly IntentDef[] = [
  {
    def:   managerChangeDef,
    title: '上司変更',
    desc:  'この組織内でレポートラインを変更します。',
    border: 'border-green-200 hover:border-green-400 hover:bg-green-50',
    badge:  'bg-green-100 text-green-700',
    icon:   '🔗',
    usePrimaryOnly: false,
  },
  {
    def:   concurrentAddDef,
    title: '兼務追加',
    desc:  '本務を維持したまま、この組織に兼務を追加する。本務行をベースに兼務行が新たに作成されます。',
    border: 'border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50',
    badge:  'bg-cyan-100 text-cyan-700',
    icon:   '📋',
    usePrimaryOnly: true,
  },
]

// 本務出向: 会社入力ステップで使うdef
export { secondmentOutSFDef, secondmentOutNonSFDef }
