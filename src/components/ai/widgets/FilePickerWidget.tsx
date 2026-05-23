interface Props {
  isActive: boolean
  onFile: (file: File) => void
  onCancel: () => void
}

export function FilePickerWidget({ isActive, onFile, onCancel }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { e.target.value = ''; onFile(file) }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <label className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-dashed transition-colors ${
        isActive
          ? 'border-blue-400 text-blue-600 hover:bg-blue-50 cursor-pointer'
          : 'border-gray-200 text-gray-400 cursor-not-allowed'
      }`}>
        <span>📂</span>
        <span>Excelファイルを選択</span>
        {isActive && (
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm"
            className="hidden"
            onChange={handleChange}
          />
        )}
      </label>
      {isActive && (
        <button
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1"
        >
          キャンセル
        </button>
      )}
    </div>
  )
}
