export function ToggleTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors"
      style={{ background: on ? '#3b82f6' : '#d1d5db' }}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
        style={{ left: 2, transform: on ? 'translateX(12px)' : 'translateX(0px)' }}
      />
    </span>
  )
}
