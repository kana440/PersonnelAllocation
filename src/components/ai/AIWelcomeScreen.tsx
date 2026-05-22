interface PromptCard {
  id: string
  icon: string
  title: string
  description: string
}

const PROMPTS_NO_DATA: PromptCard[] = [
  {
    id: 'import-excel',
    icon: '📂',
    title: 'Excelをインポートして開始',
    description: '要員配置リストのExcelファイルを読み込みます',
  },
  {
    id: 'excel-help',
    icon: '❓',
    title: 'Excelについて聞く',
    description: '対応しているExcelファイルの形式を確認します',
  },
]

const PROMPTS_WITH_DATA: PromptCard[] = [
  {
    id: 'check-org',
    icon: '👥',
    title: '組織のメンバーを確認する',
    description: '組織名を入力してメンバー一覧を表示します',
  },
  {
    id: 'promote',
    icon: '⬆️',
    title: '昇進する人を選択',
    description: '昇格対象者の名前を入力して適用します',
  },
  {
    id: 'export-excel',
    icon: '📤',
    title: 'Excelをエクスポート',
    description: '現在のデータをExcelファイルで保存します',
  },
]

interface Props {
  isDataLoaded: boolean
  onPromptClick: (id: string) => void
}

export function AIWelcomeScreen({ isDataLoaded, onPromptClick }: Props) {
  const prompts = isDataLoaded ? PROMPTS_WITH_DATA : PROMPTS_NO_DATA

  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg">
        {/* Greeting */}
        <div className="mb-8 text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">AI</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {isDataLoaded ? 'データが読み込まれています' : 'こんにちは'}
          </h2>
          <p className="mt-1.5 text-sm text-gray-500">
            {isDataLoaded
              ? '何を手伝いましょうか？'
              : '人事異動 AI アシスタントです。まずは始め方を選んでください。'}
          </p>
        </div>

        {/* Prompt cards */}
        <div className={`grid gap-3 ${prompts.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {prompts.map(p => (
            <button
              key={p.id}
              onClick={() => onPromptClick(p.id)}
              className="text-left p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">{p.icon}</div>
              <div className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                {p.title}
              </div>
              <div className="text-xs text-gray-500 mt-1">{p.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
