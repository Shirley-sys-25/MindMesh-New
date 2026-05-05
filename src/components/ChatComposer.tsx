import { type RefObject } from 'react';
import { Mic, Paperclip, Send } from 'lucide-react';
import { CHAT_ATTACHMENT_ACCEPT, type ChatAttachment } from '../hooks/useChatAttachments';

interface ChatComposerProps {
  message: string;
  attachments: ChatAttachment[];
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  isDarkMode: boolean;
  isRecording: boolean;
  isPreparingAttachments: boolean;
  isLoading: boolean;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void | Promise<void>;
  onToggleRecording: () => void | Promise<void>;
  onAttachmentSelection: (files: FileList | null) => void | Promise<void>;
}

export function ChatComposer({
  message,
  attachments,
  attachmentInputRef,
  isDarkMode,
  isRecording,
  isPreparingAttachments,
  isLoading,
  onMessageChange,
  onSendMessage,
  onToggleRecording,
  onAttachmentSelection,
}: ChatComposerProps) {
  return (
    <div className="group flex w-full items-end gap-3">
      <div className={`relative flex min-h-20 flex-1 items-center rounded-[32px] border p-2 glass-heavy ${isDarkMode ? 'border-white/5 bg-black/20' : 'border-purple-200 bg-white/80'} group-focus-within:border-purple-400 transition-all duration-300 shadow-2xl`}>
        <input 
          id="chat-attachment-input"
          ref={attachmentInputRef}
          type="file"
          accept={CHAT_ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={async (e) => onAttachmentSelection(e.target.files)}
        />

        <label
          htmlFor="chat-attachment-input"
          aria-disabled={isRecording || isPreparingAttachments}
          className={`h-full px-4 flex items-center justify-center transition-colors relative ${
            isDarkMode ? 'text-white/40 hover:text-white' : 'text-purple-900/40 hover:text-purple-600'
          } ${(isRecording || isPreparingAttachments) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
          title="Ajouter un document ou une photo"
        >
          {attachments.length > 0 && (
            <span className={`absolute right-1 top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none ${isDarkMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>
              {attachments.length}
            </span>
          )}
          <Paperclip className="w-5 h-5 relative z-10" />
        </label>

        <button 
          type="button"
          onClick={onToggleRecording}
          className={`h-full px-4 flex items-center justify-center transition-colors relative ${
            isRecording 
              ? 'text-red-500' 
              : `${isDarkMode ? 'text-white/40 hover:text-white' : 'text-purple-900/40 hover:text-purple-600'}`
          }`}
        >
          {isRecording && (
            <div className="absolute w-6 h-6 bg-red-500/30 rounded-full animate-ping" />
          )}
          <Mic className="w-5 h-5 relative z-10" />
        </button>

        <input 
          type="text" 
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSendMessage(); }}
          placeholder={isRecording ? "Écoute en cours (Cliquez pour arrêter)..." : "Instruire MindMesh..."}
          disabled={isRecording || isPreparingAttachments}
          className={`flex-1 bg-transparent border-none outline-none text-lg ${isDarkMode ? 'placeholder:text-white/40 text-white' : 'placeholder:text-slate-500 text-slate-800'} px-2 font-medium w-full`}
        />
        
        <button 
          type="button"
          onClick={onSendMessage}
          disabled={isLoading || (!message.trim() && attachments.length === 0) || isRecording || isPreparingAttachments}
          className={`w-14 h-14 gradient-vibrant rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/40 transition-all duration-300 shrink-0 ${
            isLoading || (!message.trim() && attachments.length === 0) || isRecording || isPreparingAttachments ? 'opacity-50 scale-100 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
          }`}
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
