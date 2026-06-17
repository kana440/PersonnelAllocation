import type { ChatMessage, WidgetCallbacks } from '../../application/aiTypes'
import { FilePickerWidget }           from './widgets/FilePickerWidget'
import { ExcelHelpWidget }            from './widgets/ExcelHelpWidget'
import { OrgMembersWidget }           from './widgets/OrgMembersWidget'
import { OrgTreeWidget }              from './widgets/OrgTreeWidget'
import { DiffPreviewWidget }          from './widgets/DiffPreviewWidget'
import { ExportConfirmWidget }        from './widgets/ExportConfirmWidget'
import { WizardStepsWidget }          from './widgets/WizardStepsWidget'
import { TeachAIInputWidget }         from './widgets/TeachAIInputWidget'
import { ClassificationResultWidget } from './widgets/ClassificationResultWidget'

interface Props {
  message: ChatMessage
  isActiveWidget: boolean
  callbacks: WidgetCallbacks
}

export function AIMessageBubble({ message, isActiveWidget, callbacks }: Props) {
  const isAI = message.role === 'ai'

  return (
    <div className={`flex items-start gap-3 ${isAI ? '' : 'justify-end'}`}>
      {isAI && (
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 shadow-sm">
          AI
        </div>
      )}

      <div className={`min-w-0 ${isAI ? 'flex-1 max-w-[85%]' : 'max-w-[75%]'}`}>
        {/* Bubble text */}
        {(message.text || message.isLoading) && (
          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isAI
              ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
              : 'bg-blue-500 text-white rounded-tr-sm'
          }`}>
            {message.isLoading ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1 items-center flex-shrink-0 py-0.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {message.text && (
                  <span className="text-xs text-gray-500 truncate">{message.text}</span>
                )}
              </div>
            ) : message.text}
          </div>
        )}

        {/* AIに教えるボタン: AI messages that are fully loaded and have a teach handler */}
        {isAI && !message.isLoading && message.text && callbacks.onTeachAI && (
          <div className="mt-1 flex justify-end">
            <button
              className="text-xs text-gray-400 hover:text-amber-600 hover:bg-amber-50 px-2 py-0.5 rounded-md transition-colors"
              title="この回答を訂正してAIに教える"
              onClick={() => callbacks.onTeachAI!(message.id)}
            >
              ✏️ AIに教える
            </button>
          </div>
        )}

        {/* Widget */}
        {isAI && message.widget && (
          <div className="mt-1">
            {message.widget.type === 'file-picker' && (
              <FilePickerWidget isActive={isActiveWidget} onFile={callbacks.onFileSelected} onCancel={callbacks.onImportCancel} />
            )}
            {message.widget.type === 'excel-help' && (
              <ExcelHelpWidget />
            )}
            {message.widget.type === 'org-members' && (
              <OrgMembersWidget orgName={message.widget.orgName} members={message.widget.members} />
            )}
            {message.widget.type === 'org-tree' && (
              <OrgTreeWidget orgName={message.widget.orgName} tree={message.widget.tree} />
            )}
            {message.widget.type === 'diff-preview' && (
              <DiffPreviewWidget
                persons={message.widget.persons}
                label={message.widget.label}
                isActive={isActiveWidget || !!message.llmConfirm}
                onConfirm={message.llmConfirm ?? (() => {})}
                onCancel={message.llmCancel  ?? (() => {})}
              />
            )}
            {message.widget.type === 'export-confirm' && (
              <ExportConfirmWidget
                changeCount={message.widget.changeCount}
                groups={message.widget.groups}
                isActive={isActiveWidget}
                onConfirm={callbacks.onExportConfirm}
                onCancel={callbacks.onExportCancel}
              />
            )}
            {message.widget.type === 'wizard-steps' && (
              <WizardStepsWidget
                title={message.widget.title}
                steps={message.widget.steps}
                isActive={isActiveWidget || !!message.llmConfirm}
                onConfirm={message.llmConfirm ?? (() => {})}
                onCancel={message.llmCancel  ?? (() => {})}
              />
            )}
            {message.widget.type === 'teach-ai-input' && callbacks.onTeachAISubmit && (
              <TeachAIInputWidget
                conversationWindow={message.widget.conversationWindow}
                onSubmit={callbacks.onTeachAISubmit}
                onCancel={callbacks.onTeachAICancel ?? (() => {})}
              />
            )}
            {message.widget.type === 'classification-result' && callbacks.onClassificationApply && callbacks.onClassificationReject && (
              <ClassificationResultWidget
                classified={message.widget.classified}
                onApply={callbacks.onClassificationApply}
                onReject={callbacks.onClassificationReject}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
