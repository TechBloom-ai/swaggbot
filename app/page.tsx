'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MessageSquare, Trash2, Bot } from 'lucide-react';

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
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim() || !newSwaggerUrl.trim()) {
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
        router.push(`/sessions/${session.id}/chat`);
      } else {
        const error = await response.json();
        alert(error.error?.message || error.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
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
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  return (
    <div className='flex min-h-screen flex-col bg-[var(--color-background)]'>
      {/* Header */}
      <header className='border-b border-[var(--color-border)] bg-white'>
        <div className='mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <h1 className='text-2xl font-bold'>
                <span className='text-[var(--color-circuit-green)]'>Swagg</span>
                <span className='text-[var(--color-logic-navy)]'>Bot</span>
              </h1>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className='flex items-center gap-2 rounded-lg bg-[var(--color-circuit-green)] px-4 py-2 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)]'
            >
              <Plus className='h-4 w-4' />
              New Session
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className='mx-auto flex-1 max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        <div className='mb-6'>
          <h2 className='text-xl font-semibold text-[white]'>Your Sessions</h2>
          <p className='text-[var(--color-text-secondary)]'>
            Select a session to start chatting with your API
          </p>
        </div>

        {isLoading ? (
          <div className='flex h-64 items-center justify-center'>
            <div className='h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-circuit-green)] border-t-transparent'></div>
          </div>
        ) : sessions && sessions.length === 0 ? (
          <div className='rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-background-alt)] p-12 text-center'>
            <Bot className='mx-auto h-12 w-12 text-[var(--color-text-secondary)]' />
            <h3 className='mt-4 text-lg font-medium text-[var(--color-logic-navy)]'>
              No sessions yet
            </h3>
            <p className='mt-2 text-[var(--color-text-secondary)]'>
              Create a new session to start exploring your API
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className='mt-4 rounded-lg bg-[var(--color-circuit-green)] px-4 py-2 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)]'
            >
              Create Session
            </button>
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {sessions.map(session => (
              <div
                key={session.id}
                onClick={() => router.push(`/sessions/${session.id}/chat`)}
                className='group cursor-pointer rounded-lg border border-[var(--color-border)] bg-white p-6 shadow-sm transition-all hover:border-[var(--color-circuit-green)] hover:shadow-md'
              >
                <div className='flex items-start justify-between'>
                  <div className='flex items-center gap-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-circuit-green)] bg-opacity-10'>
                      <MessageSquare className='h-5 w-5 text-[var(--color-circuit-green)]' />
                    </div>
                    <div>
                      <h3 className='font-semibold text-[var(--color-logic-navy)]'>
                        {session.name}
                      </h3>
                      <p className='text-sm text-[var(--color-text-secondary)]'>
                        {new Date(session.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={e => deleteSession(session.id, e)}
                    className='rounded p-1 text-[var(--color-text-secondary)] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100'
                  >
                    <Trash2 className='h-4 w-4' />
                  </button>
                </div>
                <p className='mt-3 truncate text-sm text-[var(--color-text-secondary)]'>
                  {session.swaggerUrl}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'>
          <div className='w-full max-w-md rounded-lg bg-white p-6 shadow-xl'>
            <h2 className='text-xl font-semibold text-[var(--color-logic-navy)]'>
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
              <div className='flex gap-3 pt-2'>
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
                  className='flex-1 rounded-lg bg-[var(--color-circuit-green)] px-4 py-2 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)] disabled:opacity-50'
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className=''>
        <TechBloomBanner />
      </footer>
    </div>
  );
}
