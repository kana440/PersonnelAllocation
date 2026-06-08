import { useRef } from 'react'
import { useSkillStore } from '../../../store/skillStore'
import type { Skill } from '../../../infrastructure/skills/types'
import { parseSkillMd, toSkillMd } from '../../../infrastructure/skills/parseMd'
import { SkillList } from './SkillList'
import { SkillEditor } from './SkillEditor'
import { strFromU8, strToU8, zip, unzip } from 'fflate'

interface Props {
  onBack:      () => void
  view:        'list' | 'editor'
  editorSkill: Skill | null          // null = 新規作成
  onSetView:   (v: 'list' | 'editor', skill?: Skill | null) => void
}

function downloadFile(name: string, content: string, mime = 'text/markdown') {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function SkillsPanel({ onBack, view, editorSkill, onSetView }: Props) {
  const { skills, loaded, save, delete: deleteSkill, resetToBuiltin } = useSkillStore()
  const importRef = useRef<HTMLInputElement>(null)

  const handleToggle = async (skill: Skill) => {
    const nextStatus = skill.status === 'active' ? 'disabled' : 'active'
    await save({ ...skill, status: nextStatus, updatedAt: new Date().toISOString() })
  }

  const handleSave = async (skill: Skill) => {
    await save(skill)
    onSetView('list')
  }

  const handleDelete = async (slug: string) => {
    await deleteSkill(slug)
    onSetView('list')
  }

  const handleReset = async (slug: string) => {
    await resetToBuiltin(slug)
    onSetView('list')
  }

  const handleExportMd = (skill: Skill) => {
    downloadFile(`${skill.slug}.md`, toSkillMd(skill))
  }

  const handleExportAll = () => {
    if (skills.length === 0) return
    const files: Record<string, Uint8Array> = {}
    for (const s of skills) {
      files[`${s.slug}.md`] = strToU8(toSkillMd(s))
    }
    zip(files, (err, data) => {
      if (!err) downloadBlob('skills.zip', new Blob([data], { type: 'application/zip' }))
    })
  }

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5 MB
    const MAX_SKILLS    = 100
    const MAX_MD_SIZE   = 200 * 1024        // 1ファイルあたり 200 KB

    if (file.size > MAX_FILE_SIZE) {
      alert('ファイルサイズが大きすぎます（上限 5 MB）')
      return
    }

    const toImport: Skill[] = []
    const now = new Date().toISOString()

    if (file.name.endsWith('.zip')) {
      const buf = await file.arrayBuffer()
      await new Promise<void>((resolve, reject) => {
        unzip(new Uint8Array(buf), (err, files) => {
          if (err) { reject(err); return }
          for (const [name, data] of Object.entries(files)) {
            if (!name.endsWith('.md')) continue
            if (data.length > MAX_MD_SIZE) continue   // 1ファイルが大きすぎる場合はスキップ
            if (toImport.length >= MAX_SKILLS) break  // 件数上限
            const slug  = name.replace(/^.*\//, '').replace(/\.md$/, '')
            const skill = parseSkillMd(strFromU8(data), { slug, isBuiltin: false, updatedAt: now })
            if (skill) toImport.push(skill)
          }
          resolve()
        })
      })
    } else if (file.name.endsWith('.md')) {
      const raw   = await file.text()
      const slug  = file.name.replace(/\.md$/, '')
      const skill = parseSkillMd(raw, { slug, isBuiltin: false, updatedAt: now })
      if (skill) toImport.push(skill)
    }

    if (toImport.length === 0) return
    // スキルの手順テキストは AI プロンプトに直接使われます。
    // 信頼できる発行元のファイルのみインポートしてください。
    for (const skill of toImport) await save(skill)
    alert(`${toImport.length} 件のスキルをインポートしました\n⚠ 手順テキストはAIへの指示として使用されます。信頼できる発行元のファイルのみ取り込んでください。`)
  }

  if (!loaded) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader onBack={onBack} />
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">読み込み中…</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader onBack={onBack} />

      <input
        ref={importRef}
        type="file"
        accept=".md,.zip"
        className="hidden"
        onChange={e => void handleImportFiles(e)}
      />

      <div className="flex-1 overflow-hidden min-h-0">
        {view === 'list' ? (
          <SkillList
            skills={skills}
            onEdit={skill => onSetView('editor', skill)}
            onToggle={s => void handleToggle(s)}
            onNew={() => onSetView('editor', null)}
            onImport={() => importRef.current?.click()}
            onExportAll={handleExportAll}
          />
        ) : (
          <SkillEditor
            skill={editorSkill}
            onSave={s => handleSave(s)}
            onDelete={handleDelete}
            onReset={handleReset}
            onExportMd={handleExportMd}
            onCancel={() => onSetView('list')}
          />
        )}
      </div>
    </div>
  )
}

function PanelHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
      <button
        onClick={onBack}
        className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors flex-shrink-0"
        title="チャットに戻る"
      >
        ✕
      </button>
      <span className="text-sm font-semibold text-gray-700">⚙ スキル設定</span>
    </div>
  )
}
