import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Sprout } from 'lucide-react';
import { Chat, GenerateContentResponse } from "@google/genai";
import { createChatSession } from '../services/geminiService';
import { AnalysisResult, ChatMessage } from '../types';

interface ChatInterfaceProps {
  result: AnalysisResult;
  onClose: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ result, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize chat session
    const chat = createChatSession(result);
    setChatSession(chat);
    
    // Add initial greeting
    setMessages([{
      role: 'model',
      text: `Hi! I'm your AI Agronomist. I see you have a **${result.diagnosis}** issue. How can I help you with this?`
    }]);
  }, [result]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !chatSession) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      // Create a placeholder for streaming response
      setMessages(prev => [...prev, { role: 'model', text: '', isStreaming: true }]);
      
      const resultStream = await chatSession.sendMessageStream({ message: userMessage });
      
      let fullText = "";
      
      for await (const chunk of resultStream) {
         const c = chunk as GenerateContentResponse;
         if (c.text) {
             fullText += c.text;
             setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'model' && lastMsg.isStreaming) {
                    lastMsg.text = fullText;
                }
                return newMessages;
             });
         }
      }
      
      // Finalize message
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'model') {
            lastMsg.isStreaming = false;
        }
        return newMessages;
      });

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "I'm having trouble connecting to the field server. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-fade-in sm:max-w-lg sm:mx-auto sm:right-0 sm:left-auto sm:shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-emerald-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200">
             <Bot size={24} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Ask the Agronomist</h3>
            <p className="text-xs text-emerald-600 font-medium">Context: {result.diagnosis}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 text-gray-500">
          <X size={24} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
              msg.role === 'user' 
                ? 'bg-emerald-600 text-white rounded-br-none' 
                : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
            }`}>
              {msg.text || (msg.isStreaming ? <span className="animate-pulse">Thinking...</span> : '')}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-100">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up question..."
            disabled={isLoading}
            className="flex-1 bg-gray-100 border-0 rounded-full px-4 py-3 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className={`p-3 rounded-full bg-emerald-600 text-white transition-all ${
               isLoading || !input.trim() ? 'opacity-50' : 'hover:bg-emerald-700 active:scale-95 shadow-lg shadow-emerald-200'
            }`}
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;