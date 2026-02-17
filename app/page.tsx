'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MessageSquare, Trash2, Bot } from 'lucide-react';

import { SessionListSkeleton, EmptyState, Spinner } from '@/components/ui';
import { toast } from '@/stores/toastStore';

import { TechBloomBanner } from './sessions/TechBloomBanner';

interface Session {
  id: string;
  name: string;
  swaggerUrl: string;
  createdAt: string;
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSwaggerUrl, setNewSwaggerUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  // Fetch sessions on load
  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/session');
      if (response.ok) {
        const result = await response.json();
        // Handle both old format and new format
        const sessionsData = result.data?.sessions || result.sessions || [];
        setSessions(sessionsData);
      } else {
        toast.error('Failed to load sessions', 'Please try again later');
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      toast.error('Failed to load sessions', 'Please check your connection and try again');
    } finally {
      setIsLoading(false);
    }
  };

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim() || !newSwaggerUrl.trim()) {
      toast.warning('Please fill in all fields');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSessionName,
          swaggerUrl: newSwaggerUrl,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Handle both old format and new format
        const session = result.data?.session || result.session;
        setShowCreateModal(false);
        setNewSessionName('');
        setNewSwaggerUrl('');
        toast.success('Session created', `Successfully created "${session.name}"`);
        router.push(`/sessions/${session.id}/chat`);
      } else {
        const error = await response.json();
        const errorMessage = error.error?.message || error.error || 'Failed to create session';
        toast.error('Failed to create session', errorMessage);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to create session', 'Please check your connection and try again');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this session?')) {
      return;
    }

    try {
      const response = await fetch(`/api/session/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSessions(sessions.filter(s => s.id !== id));
        toast.success('Session deleted', 'The session has been removed');
      } else {
        toast.error('Failed to delete session', 'Please try again');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session', 'Please check your connection and try again');
    }
  };

  return (
    <div className='flex min-h-screen flex-col bg-[var(--color-background)]'>
      {/* Header - Mobile Responsive */}
      <header className='border-b border-[var(--color-border)] bg-white'>
        <div className='mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div className='flex items-center gap-2'>
              <h1 className='text-xl sm:text-2xl font-bold'>
                <span className='text-[var(--color-circuit-green)]'>Swagg</span>
                <span className='text-[var(--color-logic-navy)]'>Bot</span>
              </h1>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className='flex items-center justify-center gap-2 rounded-lg bg-[var(--color-circuit-green)] px-4 py-2 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)] w-full sm:w-auto'
            >
              <Plus className='h-4 w-4' />
              <span className='sm:hidden'>New Session</span>
              <span className='hidden sm:inline'>New Session</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Mobile Responsive */}
      <main className='mx-auto flex-1 w-full max-w-7xl px-4 py-6 sm:py-8 sm:px-6 lg:px-8'>
        <div className='mb-6'>
          <h2 className='text-lg sm:text-xl font-semibold text-[white]'>Your Sessions</h2>
          <p className='text-sm text-[var(--color-text-secondary)] mt-1'>
            Select a session to start chatting with your API
          </p>
        </div>

        {isLoading ? (
          <SessionListSkeleton count={6} />
        ) : sessions && sessions.length === 0 ? (
          <EmptyState
            icon={Bot}
            title='No sessions yet'
            description='Create a new session to start exploring your API'
            action={{
              label: 'Create Session',
              onClick: () => setShowCreateModal(true),
            }}
          />
        ) : (
          <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'>
            {sessions.map(session => (
              <div
                key={session.id}
                className='group rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-sm transition-all hover:border-[var(--color-circuit-green)] hover:shadow-md'
              >
                <div className='flex items-start justify-between'>
                  <div className='flex items-center gap-3 min-w-0'>
                    <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-circuit-green)] bg-opacity-10'>
                      <MessageSquare className='h-5 w-5 text-[var(--color-circuit-green)]' />
                    </div>
                    <div className='min-w-0'>
                      <h3 className='font-semibold text-[var(--color-logic-navy)] truncate'>
                        {session.name}
                      </h3>
                      <p className='text-sm text-[var(--color-text-secondary)]'>
                        {new Date(session.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={e => deleteSession(session.id, e)}
                    className='flex-shrink-0 rounded p-1 text-[var(--color-text-secondary)] opacity-100 sm:opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 sm:group-hover:opacity-100'
                    aria-label='Delete session'
                  >
                    <Trash2 className='h-4 w-4' />
                  </button>
                </div>
                <p className='mt-3 truncate text-sm text-[var(--color-text-secondary)]'>
                  {session.swaggerUrl}
                </p>
                <div className='mt-4 flex gap-2'>
                  <button
                    onClick={() => router.push(`/sessions/${session.id}/chat`)}
                    className='flex-1 rounded-lg bg-[var(--color-circuit-green)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-circuit-green-dark)]'
                  >
                    Open Chat
                  </button>
                  <button
                    onClick={() => router.push(`/sessions/${session.id}`)}
                    className='rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-logic-navy)] transition-colors hover:bg-[var(--color-background-alt)] hover:text-white'
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Session Modal - Mobile Responsive */}
      {showCreateModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'>
          <div className='w-full max-w-md rounded-lg bg-white p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto'>
            <h2 className='text-lg sm:text-xl font-semibold text-[var(--color-logic-navy)]'>
              Create New Session
            </h2>
            <form onSubmit={createSession} className='mt-4 space-y-4'>
              <div>
                <label className='block text-sm font-medium text-[var(--color-logic-navy)]'>
                  Session Name
                </label>
                <input
                  type='text'
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  placeholder='e.g., Petstore API'
                  className='mt-1 w-full text-[var(--color-logic-navy)] rounded-lg border border-[var(--color-border)] px-3 py-2 focus:border-[var(--color-circuit-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-circuit-green)]'
                  required
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-[var(--color-logic-navy)]'>
                  Swagger/OpenAPI URL
                </label>
                <input
                  type='url'
                  value={newSwaggerUrl}
                  onChange={e => setNewSwaggerUrl(e.target.value)}
                  placeholder='https://petstore.swagger.io/v2/swagger.json'
                  className='mt-1 w-full text-[var(--color-logic-navy)] rounded-lg border border-[var(--color-border)] px-3 py-2 focus:border-[var(--color-circuit-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-circuit-green)]'
                  required
                />
              </div>
              <div className='flex flex-col sm:flex-row gap-3 pt-2'>
                <button
                  type='button'
                  onClick={() => setShowCreateModal(false)}
                  className='flex-1 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-[var(--color-logic-navy)] transition-colors hover:bg-[var(--color-background-alt)]'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={isCreating}
                  className='flex-1 rounded-lg bg-[var(--color-circuit-green)] px-4 py-2 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)] disabled:opacity-50 flex items-center justify-center gap-2'
                >
                  {isCreating ? (
                    <>
                      <Spinner className='h-4 w-4' />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className='mt-auto'>
        <TechBloomBanner />
      </footer>
    </div>
  );
}
