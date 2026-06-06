import type { ChatMessage, WidgetCallbacks } from '../../application/aiTypes'
import { FilePickerWidget }    from './widgets/FilePickerWidget'
import { ExcelHelpWidget }     from './widgets/ExcelHelpWidget'
import { OrgInputWidget }      from './widgets/OrgInputWidget'
import { OrgMembersWidget }    from './widgets/OrgMembersWidget'
import { OrgTreeWidget }       from './widgets/OrgTreeWidget'
import { PersonInputWidget }   from './widgets/PersonInputWidget'
import { PromoteConfirmWidget } from './widgets/PromoteConfirmWidget'
import { ReportLineWidget }    from './widgets/ReportLineWidget'
import { DiffPreviewWidget }   from './widgets/DiffPreviewWidget'
import { ImpactCheckWidget }   from './widgets/ImpactCheckWidget'
import { ExportConfirmWidget } from './widgets/ExportConfirmWidget'

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

        {/* Widget */}
        {isAI && message.widget && (
          <div className="mt-1">
            {message.widget.type === 'file-picker' && (
              <FilePickerWidget isActive={isActiveWidget} onFile={callbacks.onFileSelected} onCancel={callbacks.onImportCancel} />
            )}
            {message.widget.type === 'excel-help' && (
              <ExcelHelpWidget />
            )}
            {message.widget.type === 'org-input' && (
              <OrgInputWidget isActive={isActiveWidget} onSubmit={callbacks.onOrgNameSubmit} />
            )}
            {message.widget.type === 'org-members' && (
              <OrgMembersWidget orgName={message.widget.orgName} members={message.widget.members} />
            )}
            {message.widget.type === 'org-tree' && (
              <OrgTreeWidget orgName={message.widget.orgName} tree={message.widget.tree} />
            )}
            {message.widget.type === 'person-input' && (
              <PersonInputWidget isActive={isActiveWidget} onSubmit={callbacks.onPersonNamesSubmit} />
            )}
            {message.widget.type === 'promote-confirm' && (
              <PromoteConfirmWidget
                persons={message.widget.persons}
                isActive={isActiveWidget}
                onConfirm={callbacks.onPromoteConfirm}
                onCancel={callbacks.onPromoteCancel}
              />
            )}
            {message.widget.type === 'report-line' && (
              <ReportLineWidget
                managerName={message.widget.managerName}
                managerOrgName={message.widget.managerOrgName}
                members={message.widget.members}
              />
            )}
            {message.widget.type === 'diff-preview' && (
              <DiffPreviewWidget
                persons={message.widget.persons}
                label={message.widget.label}
                isActive={isActiveWidget || !!message.llmConfirm}
                onConfirm={message.llmConfirm ?? callbacks.onPromoteConfirm}
                onCancel={message.llmCancel ?? callbacks.onPromoteCancel}
              />
            )}
            {message.widget.type === 'impact-check' && (
              <ImpactCheckWidget
                targetOrgName={message.widget.targetOrgName}
                hasImpact={message.widget.hasImpact}
                groups={message.widget.groups}
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
          </div>
        )}
      </div>
    </div>
  )
}
