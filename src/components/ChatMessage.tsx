import ReactMarkdown from 'react-markdown';
import { motion } from 'motion/react';
import { User, Bot, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/src/lib/utils';

interface ChatMessageProps {
  message: {
    role: 'user' | 'model';
    content: string;
  };
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex w-full gap-4 p-4 rounded-3xl transition-all group",
        isUser
          ? "bg-blue-600/10 border border-blue-500/20 ml-auto max-w-[85%]"
          : "bg-white/5 border border-white/10 mr-auto max-w-[85%]"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gradient-to-br from-purple-600 to-blue-600 text-white"
        )}
      >
        {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
            {isUser ? 'You' : 'Gemini'}
          </span>
          {!isUser && (
            <button
              onClick={copyToClipboard}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </div>
        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-code:text-blue-300">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
