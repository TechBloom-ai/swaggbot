'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Send, Bot, User, ArrowLeft, Terminal, CheckCircle, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { useChatStore } from '@/stores/chatStore';
import { ChatPageSkeleton, Spinner, EmptyState } from '@/components/ui';
import { toast } from '@/stores/toastStore';

interface Session {
  id: string;
  name: string;
  swaggerUrl: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const allMessages = useChatStore(state => state.messages);
  const messages = useMemo(() => allMessages[sessionId] || [], [allMessages, sessionId]);
  const addMessage = useChatStore(state => state.addMessage);
  const loadMessages = useChatStore(state => state.loadMessages);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch session details and message history
  useEffect(() => {
    fetchSession();
    loadMessageHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`/api/session/${sessionId}`);
      if (response.ok) {
        const result = await response.json();
        // Handle both old format and new format
        const sessionData = result.data?.session || result.session;
        setSession(sessionData);
      } else {
        toast.error('Session not found', 'Redirecting to home...');
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      toast.error('Failed to load session', 'Please check your connection');
      router.push('/');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const loadMessageHistory = async () => {
    try {
      const response = await fetch(`/api/chat?sessionId=${sessionId}`);
      if (response.ok) {
        const result = await response.json();
        // Handle both old format and new format
        const messagesData = result.data?.messages || result.messages || [];
        if (messagesData.length > 0) {
          // Parse metadata from JSON strings
          const parsedMessages = messagesData.map(
            (msg: { id: string; role: string; content: string; metadata?: string }) => ({
              ...msg,
              metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined,
            })
          );
          loadMessages(sessionId, parsedMessages);
        }
      }
    } catch (error) {
      console.error('Failed to load message history:', error);
      // Don't show error to user, just continue without history
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) {
      return;
    }

    const userMessage = input.trim();
    setInput('');

    // Add user message to chat
    addMessage(sessionId, {
      role: 'user',
      content: userMessage,
    });

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
        }),
      });

      const result = await response.json();
      // Handle both old format and new format
      const data = result.data || result;

      // Add assistant response to chat
      addMessage(sessionId, {
        role: 'assistant',
        content: data.explanation || data.response || data.message || 'I processed your request.',
        metadata: {
          type: data.type,
          curl: data.curl,
          executed: data.executed,
          result: data.result,
        },
      });

      // Show toast for errors
      if (data.type === 'error') {
        toast.error('Request failed', data.message || 'An error occurred');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      addMessage(sessionId, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.',
        metadata: { type: 'error' },
      });
      toast.error('Failed to send message', 'Please check your connection and try again');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingSession) {
    return <ChatPageSkeleton />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className='flex h-[100dvh] flex-col bg-[var(--color-background)]'>
      {/* Header - Mobile Responsive */}
      <header className='border-b border-[var(--color-border)] bg-white px-3 sm:px-4 py-2 sm:py-3 flex-shrink-0'>
        <div className='mx-auto flex max-w-4xl items-center justify-between gap-2'>
          <div className='flex items-center gap-2 sm:gap-3 min-w-0'>
            <button
              onClick={() => router.push('/')}
              className='rounded-lg p-1.5 sm:p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-alt)] flex-shrink-0'
              aria-label='Go back'
            >
              <ArrowLeft className='h-4 w-4 sm:h-5 sm:w-5' />
            </button>
            <div className='min-w-0'>
              <h1 className='font-semibold text-[var(--color-logic-navy)] text-sm sm:text-base truncate'>
                {session.name}
              </h1>
              <p className='text-xs text-[var(--color-text-secondary)] truncate max-w-[150px] sm:max-w-[300px]'>
                {session.swaggerUrl}
              </p>
            </div>
          </div>
          <div className='flex items-center flex-shrink-0'>
            <span className='font-bold text-sm sm:text-base text-[var(--color-circuit-green)]'>
              Swagg
            </span>
            <span className='font-bold text-sm sm:text-base text-[var(--color-logic-navy)]'>
              Bot
            </span>
          </div>
        </div>
      </header>

      {/* Messages - Mobile Responsive */}
      <div className='flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6 min-h-0'>
        <div className='mx-auto max-w-4xl space-y-4 sm:space-y-6'>
          {messages.length === 0 ? (
            <EmptyState
              icon={Bot}
              title='Welcome to Swaggbot'
              description='I can help you explore and interact with this API. Try asking me things like:'
              action={{
                label: 'What endpoints are available?',
                onClick: () => {
                  setInput('What endpoints are available?');
                },
              }}
            />
          ) : (
            <>
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`flex gap-2 sm:gap-3 items-start ${
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full ${
                      message.role === 'user'
                        ? 'bg-[var(--color-logic-navy)]'
                        : 'bg-[var(--color-circuit-green)]'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className='h-3 w-3 sm:h-4 sm:w-4 text-white' />
                    ) : (
                      <Bot className='h-3 w-3 sm:h-4 sm:w-4 text-white' />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-lg px-3 py-2 sm:px-4 sm:py-3 ${
                      message.role === 'user'
                        ? 'bg-[var(--color-logic-navy)] text-white'
                        : 'bg-white border border-[var(--color-border)]'
                    }`}
                  >
                    <div
                      className={`text-sm markdown-content ${
                        message.role === 'user' ? 'text-white' : 'text-[var(--color-logic-navy)]'
                      }`}
                    >
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>

                    {/* Curl Command Display */}
                    {message.metadata?.curl && (
                      <div className='mt-3 rounded bg-gray-900 p-2 sm:p-3 overflow-x-auto'>
                        <div className='mb-2 flex items-center gap-2 text-xs text-gray-400'>
                          <Terminal className='h-3 w-3' />
                          <span>Generated Command</span>
                        </div>
                        <code className='block whitespace-pre-wrap break-all text-xs text-green-400'>
                          {message.metadata.curl}
                        </code>
                      </div>
                    )}

                    {message.metadata?.executed === true ? (
                      <div className='mt-2 flex items-center gap-2'>
                        <CheckCircle className='h-4 w-4 text-[var(--color-circuit-green)]' />
                        <span className='text-xs text-[var(--color-circuit-green)]'>
                          Executed successfully
                        </span>
                      </div>
                    ) : message.metadata?.executed === false ? (
                      <div className='mt-2 flex items-center gap-2'>
                        <XCircle className='h-4 w-4 text-red-500' />
                        <span className='text-xs text-red-500'>Execution failed</span>
                      </div>
                    ) : null}

                    {message.metadata?.result !== null && message.metadata?.result !== undefined ? (
                      <div className='mt-3 max-h-48 sm:max-h-64 overflow-auto rounded bg-[var(--color-background-alt)] p-2 sm:p-3'>
                        <pre className='text-xs text-[var(--color-text-secondary)]'>
                          {(() => {
                            try {
                              return JSON.stringify(message.metadata!.result, null, 2);
                            } catch {
                              return String(message.metadata!.result);
                            }
                          })()}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Typing indicator */}
          {isLoading && (
            <div className='flex gap-2 sm:gap-3 items-center'>
              <div className='flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-circuit-green)]'>
                <Bot className='h-3 w-3 sm:h-4 sm:w-4 text-white' />
              </div>
              <div className='max-w-[85%] sm:max-w-[80%] rounded-lg px-3 py-2 sm:px-4 sm:py-3 bg-white border border-[var(--color-border)]'>
                <div className='flex items-center gap-1 h-5'>
                  <span className='typing-dot w-2 h-2 bg-[var(--color-circuit-green)] rounded-full'></span>
                  <span className='typing-dot w-2 h-2 bg-[var(--color-circuit-green)] rounded-full'></span>
                  <span className='typing-dot w-2 h-2 bg-[var(--color-circuit-green)] rounded-full'></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input - Mobile Responsive */}
      <div className='border-t border-[var(--color-border)] px-3 sm:px-4 py-3 sm:py-4 flex-shrink-0'>
        <form onSubmit={sendMessage} className='mx-auto flex max-w-4xl gap-2 sm:gap-3'>
          <input
            type='text'
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder='Ask me about your API...'
            disabled={isLoading}
            className='flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base focus:border-[var(--color-circuit-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-circuit-green)] disabled:bg-[var(--color-background-alt)]'
          />
          <button
            type='submit'
            disabled={isLoading || !input.trim()}
            className='flex items-center gap-1.5 sm:gap-2 rounded-lg bg-[var(--color-circuit-green)] px-4 sm:px-6 py-2.5 sm:py-3 text-white text-sm sm:text-base transition-colors hover:bg-[var(--color-circuit-green-dark)] disabled:bg-gray-400'
          >
            {isLoading ? (
              <Spinner className='h-4 w-4 sm:h-5 sm:w-5' />
            ) : (
              <>
                <span className='hidden sm:inline'>Send</span>
                <Send className='h-4 w-4' />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
