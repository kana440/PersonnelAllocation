import { useState, useEffect, useRef, useCallback } from 'react'
import type { Skill } from '../../../infrastructure/skills/types'
import { ToolPicker } from './ToolPicker'

const STATUS_OPTIONS: { value: 'active' | 'disabled'; label: string; hint: string }[] = [
  { value: 'active',   label: '有効',  hint: 'AIが自動的に使用する' },
  { value: 'disabled', label: '無効',  hint: '保存されるがAIは使用しない' },
]

function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  // 日本語など非ASCII名はタイムスタンプIDにフォールバック
  return ascii.length >= 3 ? ascii : `skill-${Date.now().toString(36)}`
}

// Markdownツールバー
const MD_BUTTONS: { label: string; before: string; after?: string; title: string }[] = [
  { label: 'H1',  before: '# ',   title: '見出し1' },
  { label: 'H2',  before: '## ',  title: '見出し2' },
  { label: '太',  before: '**', after: '**', title: '太字' },
  { label: '`',   before: '`',  after: '`',  title: 'インラインコード' },
  { label: '```', before: '```\n', after: '\n```', title: 'コードブロック' },
  { label: '-',   before: '- ',   title: 'リスト' },
  { label: '1.',  before: '1. ',  title: '番号付きリスト' },
]

// ── シンプルなMarkdownレンダラー ────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inlineRender(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`]+)`/g,     '<code class="bg-gray-100 text-blue-700 px-0.5 rounded font-mono text-[11px]">$1</code>')
}
function renderMarkdown(raw: string): string {
  // コードブロックを先に退避
  const blocks: string[] = []
  let md = raw.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code: string) => {
    const ph = `\x00B${blocks.length}\x00`
    blocks.push(`<pre class="bg-gray-100 rounded p-2 text-[11px] font-mono overflow-x-auto my-1 whitespace-pre"><code>${esc(code.trimEnd())}</code></pre>`)
    return ph
  })

  const sections = md.split(/\n{2,}/)
  return sections.map(sec => {
    const m = sec.match(/\x00B(\d+)\x00/)
    if (m) return blocks[parseInt(m[1])] ?? ''

    const lines = sec.split('\n').filter(l => l.trim())
    if (!lines.length) return ''

    const f = lines[0]
    if (f.startsWith('# '))   return `<h1 class="text-sm font-bold text-gray-800 mt-3 mb-1">${inlineRender(f.slice(2))}</h1>`
    if (f.startsWith('## '))  return `<h2 class="text-xs font-bold text-gray-700 mt-2 mb-0.5 border-b border-gray-200 pb-0.5">${inlineRender(f.slice(3))}</h2>`
    if (f.startsWith('### ')) return `<h3 class="text-xs font-semibold text-gray-600 mt-1.5 mb-0.5">${inlineRender(f.slice(4))}</h3>`

    const isOL = /^\d+\.\s/.test(f)
    const isUL = /^[-*]\s/.test(f)
    if (isOL || isUL) {
      const items = lines.map(l => `<li>${inlineRender(l.replace(/^(\d+\.|[-*])\s+/, ''))}</li>`).join('')
      return isOL
        ? `<ol class="text-xs list-decimal pl-4 my-1 space-y-0.5">${items}</ol>`
        : `<ul class="text-xs list-disc pl-4 my-1 space-y-0.5">${items}</ul>`
    }

    return `<p class="text-xs text-gray-700 leading-relaxed my-1">${lines.map(inlineRender).join('<br/>')}</p>`
  }).join('\n')
}

// ────────────────────────────────────────────────────────────────────────────

interface Props {
  skill:      Skill | null
  onSave:     (skill: Skill) => Promise<void>
  onDelete:   (slug: string) => Promise<void>
  onReset:    (slug: string) => Promise<void>
  onExportMd: (skill: Skill) => void
  onCancel:   () => void
}

export function SkillEditor({ skill, onSave, onDelete, onReset, onExportMd, onCancel }: Props) {
  const isNew = skill === null

  const [slug,         setSlug]         = useState(skill?.slug         ?? '')
  const [name,         setName]         = useState(skill?.name         ?? '')
  const [description,  setDescription]  = useState(skill?.description  ?? '')
  const [instructions, setInstructions] = useState(skill?.instructions ?? '')
  // draft は廃止: 既存 draft は disabled として扱う
  const [status, setStatus] = useState<'active' | 'disabled'>(
    (skill?.status === 'active' ? 'active' : 'disabled')
  )
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cursorRef   = useRef({ start: 0, end: 0 })

  // 新規作成時: 名前からslugを自動生成
  useEffect(() => {
    if (isNew) setSlug(slugify(name))
  }, [name, isNew])

  const saveCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    cursorRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }
  }

  const handleInsertTool = useCallback((text: string) => {
    const { start, end } = cursorRef.current
    const newVal = instructions.substring(0, start) + text + instructions.substring(end)
    setInstructions(newVal)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
      cursorRef.current = { start: start + text.length, end: start + text.length }
    })
  }, [instructions])

  const handleMdButton = (before: string, after = '') => {
    const el = textareaRef.current
    if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    const sel = instructions.substring(s, e)
    const newVal = instructions.substring(0, s) + before + sel + after + instructions.substring(e)
    setInstructions(newVal)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + before.length, s + before.length + sel.length)
    })
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('名前は必須です'); return }
    const finalSlug = slug.trim() || slugify(name)
    setSaving(true); setError(null)
    try {
      await onSave({
        slug:         finalSlug,
        name:         name.trim(),
        description:  description.trim(),
        instructions: instructions.trim(),
        status,
        isBuiltin:    skill?.isBuiltin ?? false,
        updatedAt:    new Date().toISOString(),
      })
    } catch (e) { setError(String(e)); setSaving(false); return }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!skill) return
    if (!window.confirm(`「${skill.name}」を削除しますか？`)) return
    setSaving(true)
    try { await onDelete(skill.slug) }
    catch (e) { setError(String(e)); setSaving(false) }
  }

  const handleReset = async () => {
    if (!skill?.isBuiltin) return
    if (!window.confirm(`「${skill.name}」を組み込みの初期状態にリセットしますか？`)) return
    setSaving(true)
    try { await onReset(skill.slug) }
    catch (e) { setError(String(e)); setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
          ← 戻る
        </button>
        <div className="flex items-center gap-1">
          {!isNew && (
            <button
              onClick={() => skill && onExportMd(skill)}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
              title=".md でエクスポート"
            >↓ .md</button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="text-xs font-medium bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>

      {/* フォーム */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded px-2.5 py-1.5">{error}</div>
        )}

        {/* 名前 */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">名前 *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例: 玉突き人事ウィザード"
            className="w-full text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* スキルID */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            スキルID
            {isNew
              ? <span className="ml-1 text-gray-400 font-normal">（名前から自動生成・変更可）</span>
              : <span className="ml-1 text-gray-400 font-normal">（変更不可）</span>
            }
          </label>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^\w-]/g, '').slice(0, 64))}
            placeholder="英数字・ハイフン（例: cascading-transfer）"
            disabled={!isNew}
            className="w-full text-xs border border-gray-300 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        {/* いつ使うか */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            いつ使うか <span className="text-gray-400 font-normal">（AI のトリガー判定に使う・短く）</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="例: 複数人の連鎖異動を処理するとき"
            className="w-full text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* ステータス */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">ステータス</label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map(o => (
              <label key={o.value} className={`flex-1 flex items-center gap-1.5 cursor-pointer border rounded px-2.5 py-1.5 transition-colors ${
                status === o.value
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="skill-status"
                  value={o.value}
                  checked={status === o.value}
                  onChange={() => setStatus(o.value)}
                  className="text-blue-600"
                />
                <span className="min-w-0">
                  <span className="text-xs font-medium text-gray-700 block">{o.label}</span>
                  <span className="text-[10px] text-gray-400">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* 手順 Markdown（編集/プレビュー切り替え） */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">手順（Markdown）</label>
            <div className="flex rounded border border-gray-200 overflow-hidden text-[11px]">
              <button
                type="button"
                onClick={() => setEditorTab('edit')}
                className={`px-2 py-0.5 transition-colors ${editorTab === 'edit' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >編集</button>
              <button
                type="button"
                onClick={() => setEditorTab('preview')}
                className={`px-2 py-0.5 transition-colors ${editorTab === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >プレビュー</button>
            </div>
          </div>

          {editorTab === 'edit' ? (
            <>
              {/* Markdownツールバー */}
              <div className="flex items-center gap-0.5 mb-1 flex-wrap">
                {MD_BUTTONS.map(b => (
                  <button
                    key={b.label}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handleMdButton(b.before, b.after ?? '') }}
                    title={b.title}
                    className="text-[11px] font-mono px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-100 text-gray-600 transition-colors"
                  >{b.label}</button>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                onSelect={saveCursor}
                onBlur={saveCursor}
                rows={10}
                placeholder={`# スキル名\n\n## 手順\n\n1. ...\n2. ...\n\n## 使用ツール\n\n**使用するツール**: \`tool1\`, \`tool2\`\n**禁止**: \`tool3\``}
                className="w-full text-xs border border-gray-300 rounded px-2.5 py-2 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
              />
            </>
          ) : (
            <div
              className="min-h-[160px] border border-gray-200 rounded px-3 py-2 bg-white overflow-y-auto prose prose-xs max-w-none"
              dangerouslySetInnerHTML={{ __html: instructions.trim() ? renderMarkdown(instructions) : '<p class="text-gray-300 text-xs">（内容がありません）</p>' }}
            />
          )}
        </div>

        {/* ツールピッカー（編集タブのみ） */}
        {editorTab === 'edit' && <ToolPicker onInsert={handleInsertTool} />}

        {/* 削除・リセット */}
        {!isNew && (
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            {skill?.isBuiltin && (
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={saving}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
              >組み込みにリセット</button>
            )}
            {!skill?.isBuiltin && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-40"
              >削除</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
