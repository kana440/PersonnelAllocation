import { useRef, useEffect } from 'react'
import type { ChatMessage, WidgetCallbacks } from '../../application/aiTypes'
import { AIMessageBubble } from './AIMessageBubble'

interface Props {
  messages: ChatMessage[]
  activeWidgetMsgId: string | null
  callbacks: WidgetCallbacks
}

export function AIMessageThread({ messages, activeWidgetMsgId, callbacks }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {messages.map(msg => (
          <AIMessageBubble
            key={msg.id}
            message={msg}
            isActiveWidget={msg.id === activeWidgetMsgId}
            callbacks={callbacks}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
