/**
 * 汎用モーダルシェル。
 * backdrop（黒半透明）＋センタリング＋ホワイトカードを提供する。
 * backdrop クリックで onClose が呼ばれる（onClose を省略するとクリックで閉じない）。
 */
interface Props {
  onClose?:    () => void
  children:    React.ReactNode
  /** 内部カードの最大幅クラス（例: 'max-w-sm', 'max-w-md'）。デフォルト 'max-w-sm' */
  maxWidth?:   string
  /** z-index クラス。デフォルト 'z-[9999]' */
  zIndex?:     string
}

export function ModalShell({ onClose, children, maxWidth = 'max-w-sm', zIndex = 'z-[9999]' }: Props) {
  return (
    <div
      className={`fixed inset-0 bg-black/40 flex items-center justify-center ${zIndex}`}
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose() } : undefined}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-full ${maxWidth} mx-4`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
