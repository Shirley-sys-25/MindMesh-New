import { AlertTriangle, Brain, FileText, Image } from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type ChatStreamMessage } from '../hooks/useChatStream';

interface ChatMessagesProps {
  messages: ChatStreamMessage[];
  isDarkMode: boolean;
  isLoading: boolean;
  userImageUrl?: string | null;
}

export function ChatMessages({ messages, isDarkMode, isLoading, userImageUrl }: ChatMessagesProps) {
  const markdownBubbleClass = isDarkMode
    ? 'prose prose-invert max-w-none prose-headings:text-inherit prose-p:my-3 prose-p:leading-relaxed prose-strong:text-inherit prose-em:text-inherit prose-a:text-fuchsia-300 prose-a:no-underline hover:prose-a:underline prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:marker:text-purple-400 prose-blockquote:border-purple-400/30 prose-blockquote:text-inherit prose-code:text-fuchsia-200 prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10'
    : 'prose prose-slate max-w-none prose-headings:text-inherit prose-p:my-3 prose-p:leading-relaxed prose-strong:text-inherit prose-em:text-inherit prose-a:text-purple-700 prose-a:no-underline hover:prose-a:underline prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:marker:text-purple-500 prose-blockquote:border-purple-400/30 prose-blockquote:text-inherit prose-code:text-purple-700 prose-code:bg-purple-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-pre:bg-slate-50 prose-pre:border prose-pre:border-purple-100';

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-full flex flex-col gap-6 overflow-y-auto custom-scrollbar p-6 relative z-10 mx-auto"
    >
      {messages.map((m, index) => {
        const isUserMessage = m.role === 'user';
        const isAssistantMessage = m.role === 'assistant';
        const isErrorMessage = m.role === 'system' && m.tone === 'error';

        return (
          <div key={index} className={`flex gap-4 ${isUserMessage ? 'justify-end' : ''}`}>
            {isAssistantMessage && (
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shrink-0">
                <Brain size={18} />
              </div>
            )}

            {isErrorMessage && (
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 border border-red-500/30 shrink-0">
                <AlertTriangle size={18} />
              </div>
            )}

            <div className={`text-sm leading-relaxed markdown-body ${markdownBubbleClass} ${
              isUserMessage
                ? 'w-fit max-w-[80%] px-4 py-2 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-none shadow-lg shadow-purple-500/20 whitespace-pre-wrap break-words'
                : isErrorMessage
                  ? `w-fit max-w-[80%] px-4 py-2 rounded-2xl rounded-bl-none ${isDarkMode ? 'bg-red-500/10 border border-red-500/40 text-red-100' : 'bg-red-50 border border-red-200 text-red-700'}`
                  : `w-fit max-w-[80%] px-4 py-2 rounded-2xl rounded-bl-none ${isDarkMode ? 'bg-white/5 border border-white/10 text-gray-200' : 'bg-white border border-purple-100 text-slate-700 shadow-sm'}`
            }`}>
              {isUserMessage ? (
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{(m.content || '').replace(/\\n/g, '\n')}</ReactMarkdown>
              )}
            </div>

            {m.attachments && m.attachments.length > 0 && (
              <div className={`mt-2 flex max-w-[80%] flex-wrap gap-2 ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
                {m.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-xs ${isDarkMode ? 'border-white/10 bg-black/20 text-gray-200' : 'border-purple-100 bg-white text-slate-700'}`}
                  >
                    {attachment.kind === 'image' && attachment.dataUrl ? (
                      <img
                        src={attachment.dataUrl}
                        alt={attachment.name}
                        className="h-10 w-10 rounded-xl object-cover border border-white/10"
                      />
                    ) : (
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDarkMode ? 'bg-white/10 text-purple-300' : 'bg-purple-50 text-purple-600'}`}>
                        {attachment.kind === 'image' ? <Image className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{attachment.name}</div>
                      <div className={isDarkMode ? 'text-white/40' : 'text-slate-500'}>
                        {attachment.kind === 'image' ? 'Image' : 'Document'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isUserMessage && (
              <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center border border-white/10 overflow-hidden shrink-0 shadow-lg">
                <img src={userImageUrl || 'https://picsum.photos/seed/userelegant/100/100'} alt="Avatar user" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        );
      })}

      {isLoading && (
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shrink-0 animate-pulse">
            <Brain size={18} />
          </div>
          <div className={`p-5 rounded-[24px] rounded-bl-none italic text-sm border ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-white border-purple-100 text-slate-500'}`}>
            L'Orchestrateur réfléchit...
          </div>
        </div>
      )}
    </motion.div>
  );
}
