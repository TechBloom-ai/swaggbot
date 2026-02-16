import { create } from 'zustand';
import { ChatMessage } from '@/lib/types';

interface ChatStore {
  // Messages organized by session ID
  messages: Record<string, ChatMessage[]>;

  // Actions
  addMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  loadMessages: (sessionId: string, messages: ChatMessage[]) => void;
  getMessages: (sessionId: string) => ChatMessage[];
  clearSession: (sessionId: string) => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: {},

  addMessage: (sessionId, message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), newMessage],
      },
    }));
  },

  loadMessages: (sessionId, messages) => {
    // Convert string timestamps to Date objects
    const convertedMessages = messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));

    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: convertedMessages,
      },
    }));
  },

  getMessages: (sessionId) => {
    return get().messages[sessionId] || [];
  },

  clearSession: (sessionId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: [],
      },
    }));
  },

  clearAll: () => {
    set({ messages: {} });
  },
}));
