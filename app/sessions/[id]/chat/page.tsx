'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Send, Bot, User, ArrowLeft, Terminal, CheckCircle, XCircle, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { WorkflowProgressState, WorkflowStepProgress } from '@/lib/types';
import { WorkflowProgress } from '@/components/workflow';
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
  const updateMessage = useChatStore(state => state.updateMessage);
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
          // Parse metadata from JSON strings and reconstruct workflow progress
          const parsedMessages = messagesData.map(
            (msg: { id: string; role: string; content: string; metadata?: string }) => {
              const metadata = msg.metadata ? JSON.parse(msg.metadata) : undefined;

              // Reconstruct workflowProgress from saved result for workflow messages
              if (
                metadata?.type === 'workflow_result' &&
                Array.isArray(metadata.result) &&
                !metadata.workflowProgress
              ) {
                const steps: WorkflowStepProgress[] = metadata.result.map(
                  (r: { step: number; description: string; success: boolean; error?: string }) => ({
                    step: r.step,
                    description: r.description,
                    status: r.success ? ('completed' as const) : ('failed' as const),
                    error: r.error,
                  })
                );
                metadata.workflowProgress = {
                  phase: steps.every(s => s.status === 'completed') ? 'completed' : 'error',
                  totalSteps: steps.length,
                  steps,
                };
              }

              return { ...msg, metadata };
            }
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

      // Check if it's a SSE stream (workflow)
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/event-stream')) {
        await handleWorkflowStream(response);
        return;
      }

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

  /**
   * Process a single SSE event and update the workflow message
   */
  const processWorkflowEvent = useCallback(
    (messageId: string, event: Record<string, unknown>) => {
      // We need to read current state to build incremental updates
      const currentMessages = useChatStore.getState().messages[sessionId] || [];
      const currentMsg = currentMessages.find(m => m.id === messageId);
      const currentProgress: WorkflowProgressState = currentMsg?.metadata?.workflowProgress || {
        phase: 'planning',
        totalSteps: 0,
        steps: [],
      };

      let updatedProgress: WorkflowProgressState;

      switch (event.type) {
        case 'planning':
          updatedProgress = {
            ...currentProgress,
            phase: 'planning',
          };
          break;

        case 'step_start': {
          const totalSteps = (event.totalSteps as number) || currentProgress.totalSteps;
          const stepNum = event.step as number;
          const description = event.description as string;

          // Initialize all pending steps if this is the first step_start
          let steps = [...currentProgress.steps];
          if (steps.length === 0 && totalSteps > 0) {
            steps = Array.from({ length: totalSteps }, (_, i) => ({
              step: i + 1,
              description: i + 1 === stepNum ? description : `Step ${i + 1}`,
              status: 'pending' as const,
            }));
          }

          // Update the current step to running
          steps = steps.map(s =>
            s.step === stepNum ? { ...s, description, status: 'running' as const } : s
          );

          updatedProgress = {
            ...currentProgress,
            phase: 'executing',
            totalSteps,
            steps,
          };
          break;
        }

        case 'step_complete': {
          const steps = currentProgress.steps.map(s =>
            s.step === (event.step as number)
              ? {
                  ...s,
                  description: (event.description as string) || s.description,
                  status: 'completed' as const,
                  result: event.result,
                  httpCode: event.httpCode as number | undefined,
                }
              : s
          );
          updatedProgress = {
            ...currentProgress,
            steps,
          };
          break;
        }

        case 'step_failed': {
          const steps = currentProgress.steps.map(s =>
            s.step === (event.step as number)
              ? {
                  ...s,
                  description: (event.description as string) || s.description,
                  status: 'failed' as const,
                  error: event.error as string,
                  httpCode: event.httpCode as number | undefined,
                }
              : s
          );
          updatedProgress = {
            ...currentProgress,
            steps,
          };
          break;
        }

        case 'workflow_complete':
          updatedProgress = {
            ...currentProgress,
            phase: 'completed',
          };
          updateMessage(sessionId, messageId, {
            content: (event.message as string) || 'Workflow completed.',
            metadata: {
              type: 'workflow_result',
              executed: event.success as boolean,
              result: event.result,
              workflowProgress: updatedProgress,
            },
          });
          return;

        case 'workflow_error':
          updatedProgress = {
            ...currentProgress,
            phase: 'error',
            error: event.error as string,
          };
          updateMessage(sessionId, messageId, {
            content: (event.error as string) || 'Workflow failed.',
            metadata: {
              type: 'workflow_result',
              executed: false,
              workflowProgress: updatedProgress,
            },
          });
          return;

        default:
          return;
      }

      updateMessage(sessionId, messageId, {
        metadata: {
          type: 'workflow_result',
          workflowProgress: updatedProgress,
        },
      });
    },
    [sessionId, updateMessage]
  );

  /**
   * Handle SSE stream for real-time workflow progress
   */
  const handleWorkflowStream = useCallback(
    async (response: Response) => {
      // Create a placeholder assistant message with workflow progress
      const messageId = crypto.randomUUID();
      const initialProgress: WorkflowProgressState = {
        phase: 'planning',
        totalSteps: 0,
        steps: [],
      };

      addMessage(sessionId, {
        id: messageId,
        role: 'assistant',
        content: 'Executing workflow...',
        metadata: {
          type: 'workflow_result',
          workflowProgress: initialProgress,
        },
      });

      const reader = response.body?.getReader();
      if (!reader) {
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }

            try {
              const event = JSON.parse(line.slice(6));
              processWorkflowEvent(messageId, event);
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (error) {
        console.error('Stream reading error:', error);
        updateMessage(sessionId, messageId, {
          content: 'Workflow execution encountered a connection error.',
          metadata: {
            type: 'workflow_result',
            workflowProgress: {
              phase: 'error',
              totalSteps: 0,
              steps: [],
              error: 'Connection lost during workflow execution.',
            },
          },
        });
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, addMessage, updateMessage, processWorkflowEvent]
  );

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
              className='rounded-lg p-1.5 sm:p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-alt)] hover:text-white flex-shrink-0'
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
          <div className='flex items-center gap-2 sm:gap-3 flex-shrink-0'>
            <button
              onClick={() => router.push(`/sessions/${sessionId}`)}
              className='rounded-lg p-1.5 sm:p-2 text-[var(--color-text-secondary)] hover:text-white transition-colors hover:bg-[var(--color-background-alt)] hover:text-[var(--color-logic-navy)]'
              title='Session Settings'
              aria-label='Session Settings'
            >
              <Settings className='h-4 w-4 sm:h-5 sm:w-5' />
            </button>
            <div className='flex items-center'>
              <span className='font-bold text-sm sm:text-base text-[var(--color-circuit-green)]'>
                Swagg
              </span>
              <span className='font-bold text-sm sm:text-base text-[var(--color-logic-navy)]'>
                Bot
              </span>
            </div>
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
                      {/* Hide placeholder text during live streaming, show final content */}
                      {!(
                        message.metadata?.workflowProgress &&
                        (message.metadata.workflowProgress.phase === 'planning' ||
                          message.metadata.workflowProgress.phase === 'executing')
                      ) && <ReactMarkdown>{message.content}</ReactMarkdown>}
                    </div>

                    {/* Workflow Progress Display */}
                    {message.metadata?.workflowProgress && (
                      <div className='mt-2'>
                        <WorkflowProgress
                          progress={message.metadata.workflowProgress}
                          result={message.metadata.result}
                        />
                      </div>
                    )}

                    {/* Curl Command Display (non-workflow only) */}
                    {message.metadata?.curl && message.metadata?.type !== 'workflow_result' && (
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

                    {message.metadata?.type !== 'workflow_result' &&
                    message.metadata?.executed === true ? (
                      <div className='mt-2 flex items-center gap-2'>
                        <CheckCircle className='h-4 w-4 text-[var(--color-circuit-green)]' />
                        <span className='text-xs text-[var(--color-circuit-green)]'>
                          Executed successfully
                        </span>
                      </div>
                    ) : message.metadata?.type !== 'workflow_result' &&
                      message.metadata?.executed === false ? (
                      <div className='mt-2 flex items-center gap-2'>
                        <XCircle className='h-4 w-4 text-red-500' />
                        <span className='text-xs text-red-500'>Execution failed</span>
                      </div>
                    ) : null}

                    {message.metadata?.type !== 'workflow_result' &&
                    message.metadata?.result !== null &&
                    message.metadata?.result !== undefined ? (
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
