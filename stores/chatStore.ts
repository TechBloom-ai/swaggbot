import { create } from 'zustand';

import { ChatMessage } from '@/lib/types';

interface ChatStore {
  // Messages organized by session ID
  messages: Record<string, ChatMessage[]>;

  // Actions
  addMessage: (
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'timestamp'> & { id?: string }
  ) => void;
  updateMessage: (
    sessionId: string,
    messageId: string,
    updates: Partial<Pick<ChatMessage, 'content' | 'metadata'>>
  ) => void;
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
      id: message.id || crypto.randomUUID(),
      timestamp: new Date(),
    };

    set(state => ({
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), newMessage],
      },
    }));
  },

  updateMessage: (sessionId, messageId, updates) => {
    set(state => {
      const sessionMessages = state.messages[sessionId] || [];
      return {
        messages: {
          ...state.messages,
          [sessionId]: sessionMessages.map(msg => {
            if (msg.id !== messageId) {
              return msg;
            }

            const merged = { ...msg };
            if (updates.content !== undefined) {
              merged.content = updates.content;
            }
            if (updates.metadata !== undefined) {
              // Merge metadata, but remove keys explicitly set to undefined
              const newMeta = { ...msg.metadata, ...updates.metadata };
              for (const key of Object.keys(newMeta) as Array<keyof typeof newMeta>) {
                if (newMeta[key] === undefined) {
                  delete newMeta[key];
                }
              }
              merged.metadata = newMeta;
            }
            return merged;
          }),
        },
      };
    });
  },

  loadMessages: (sessionId, messages) => {
    // Convert string timestamps to Date objects
    const convertedMessages = messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));

    set(state => ({
      messages: {
        ...state.messages,
        [sessionId]: convertedMessages,
      },
    }));
  },

  getMessages: sessionId => {
    return get().messages[sessionId] || [];
  },

  clearSession: sessionId => {
    set(state => ({
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
