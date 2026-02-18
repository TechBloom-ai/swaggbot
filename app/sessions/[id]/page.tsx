'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MessageSquare,
  Trash2,
  Edit2,
  Key,
  FileText,
  BarChart3,
  Check,
  X,
  Eye,
  EyeOff,
  ExternalLink,
  Copy,
  CheckCircle,
} from 'lucide-react';

import { toast } from '@/stores/toastStore';
import { Spinner } from '@/components/ui';

interface Session {
  id: string;
  name: string;
  swaggerUrl: string;
  baseUrl: string | null;
  authToken: string | null;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
}

interface SessionStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  lastAccessedAt: string;
  createdAt: string;
}

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isUpdatingToken, setIsUpdatingToken] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [swaggerDoc, setSwaggerDoc] = useState<Record<string, unknown> | null>(null);
  const [showSwagger, setShowSwagger] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSession();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`/api/session/${sessionId}`);
      if (response.ok) {
        const result = await response.json();
        const sessionData = result.data?.session || result.session;
        setSession(sessionData);
        setEditName(sessionData.name);

        if (sessionData.swaggerDoc) {
          try {
            const parsed = JSON.parse(sessionData.swaggerDoc);
            setSwaggerDoc(parsed);
          } catch {
            console.error('Failed to parse swagger doc');
          }
        }
      } else {
        toast.error('Session not found', 'Redirecting to home...');
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      toast.error('Failed to load session', 'Please check your connection');
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/session/${sessionId}/stats`);
      if (response.ok) {
        const result = await response.json();
        const statsData = result.data?.stats || result.stats;
        setStats(statsData);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleUpdateName = async () => {
    if (!editName.trim() || editName === session?.name) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (response.ok) {
        const result = await response.json();
        const updatedSession = result.data?.session || result.session;
        setSession(updatedSession);
        toast.success('Session updated', 'Name has been changed successfully');
        setIsEditing(false);
      } else {
        toast.error('Failed to update session', 'Please try again');
      }
    } catch (error) {
      console.error('Failed to update session:', error);
      toast.error('Failed to update session', 'Please check your connection');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateToken = async () => {
    setIsUpdatingToken(true);
    try {
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: newToken.trim() || null }),
      });

      if (response.ok) {
        const result = await response.json();
        const updatedSession = result.data?.session || result.session;
        setSession(updatedSession);
        toast.success('Token updated', 'Authentication token has been updated');
        setNewToken('');
      } else {
        toast.error('Failed to update token', 'Please try again');
      }
    } catch (error) {
      console.error('Failed to update token:', error);
      toast.error('Failed to update token', 'Please check your connection');
    } finally {
      setIsUpdatingToken(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!confirm('Are you sure you want to remove the authentication token?')) {
      return;
    }

    try {
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: null }),
      });

      if (response.ok) {
        const result = await response.json();
        const updatedSession = result.data?.session || result.session;
        setSession(updatedSession);
        toast.success('Token removed', 'Authentication token has been deleted');
      } else {
        toast.error('Failed to remove token', 'Please try again');
      }
    } catch (error) {
      console.error('Failed to remove token:', error);
      toast.error('Failed to remove token', 'Please check your connection');
    }
  };

  const handleDeleteSession = async () => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Session deleted', 'Redirecting to home...');
        router.push('/');
      } else {
        toast.error('Failed to delete session', 'Please try again');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session', 'Please check your connection');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[var(--color-background)]'>
        <Spinner className='h-8 w-8' />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className='min-h-screen bg-[var(--color-background)]'>
      {/* Header - Mobile Responsive */}
      <header className='border-b border-[var(--color-border)] bg-white'>
        <div className='mx-auto max-w-5xl px-3 sm:px-4 py-3 sm:py-4 lg:px-8'>
          <div className='flex items-center gap-2 sm:gap-4'>
            <button
              onClick={() => router.push('/')}
              className='rounded-lg p-1.5 sm:p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-alt)] flex-shrink-0'
              aria-label='Go back'
            >
              <ArrowLeft className='h-4 w-4 sm:h-5 sm:w-5' />
            </button>
            <div className='flex-1 min-w-0'>
              {isEditing ? (
                <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
                  <input
                    type='text'
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className='w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-base sm:text-lg font-semibold focus:border-[var(--color-circuit-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-circuit-green)] focus:text-logic-navy'
                    disabled={isSaving}
                    autoFocus
                  />
                  <div className='flex gap-2 flex-shrink-0'>
                    <button
                      onClick={handleUpdateName}
                      disabled={isSaving || !editName.trim()}
                      className='rounded-lg bg-[var(--color-circuit-green)] p-2 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)] disabled:opacity-50'
                    >
                      {isSaving ? <Spinner className='h-4 w-4' /> : <Check className='h-4 w-4' />}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditName(session.name);
                      }}
                      disabled={isSaving}
                      className='rounded-lg border border-[var(--color-border)] bg-white p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-alt)]'
                    >
                      <X className='h-4 w-4' />
                    </button>
                  </div>
                </div>
              ) : (
                <div className='flex items-center gap-2 group'>
                  <h1 className='text-base sm:text-xl font-semibold text-[var(--color-logic-navy)] truncate'>
                    {session.name}
                  </h1>
                  <button
                    onClick={() => setIsEditing(true)}
                    className='rounded p-1 text-[var(--color-text-secondary)] opacity-100 sm:opacity-0 transition-opacity hover:bg-[var(--color-background-alt)] sm:group-hover:opacity-100 flex-shrink-0'
                    aria-label='Edit session name'
                  >
                    <Edit2 className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                  </button>
                </div>
              )}
              <p className='mt-0.5 sm:mt-1 text-xs sm:text-sm text-[var(--color-text-secondary)] truncate'>
                {session.swaggerUrl}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Mobile Responsive */}
      <main className='mx-auto max-w-5xl px-3 sm:px-4 py-4 sm:py-6 lg:px-8'>
        <div className='grid gap-3 sm:gap-6 lg:grid-cols-3'>
          {/* Left Column - Actions & Stats */}
          <div className='space-y-3 sm:space-y-6 lg:col-span-1'>
            {/* Quick Actions */}
            <div className='rounded-lg border border-[var(--color-border)] bg-white p-3 sm:p-6'>
              <h2 className='text-xs sm:text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'>
                Actions
              </h2>
              <div className='mt-2 sm:mt-4 grid grid-cols-2 sm:grid-cols-1 gap-2 sm:gap-3'>
                <button
                  onClick={() => router.push(`/sessions/${sessionId}/chat`)}
                  className='flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-circuit-green)] px-3 sm:px-4 py-2 sm:py-2.5 text-sm text-white transition-colors hover:bg-[var(--color-circuit-green-dark)]'
                >
                  <MessageSquare className='h-4 w-4' />
                  <span className='whitespace-nowrap'>Open Chat</span>
                </button>
                <button
                  onClick={handleDeleteSession}
                  className='flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 sm:px-4 py-2 sm:py-2.5 text-sm text-red-600 transition-colors hover:bg-red-100'
                >
                  <Trash2 className='h-4 w-4' />
                  <span className='whitespace-nowrap'>Delete</span>
                </button>
              </div>
            </div>

            {/* Session Stats */}
            {stats && (
              <div className='rounded-lg border border-[var(--color-border)] bg-white p-3 sm:p-6'>
                <h2 className='flex items-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'>
                  <BarChart3 className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                  Statistics
                </h2>
                <div className='mt-2 sm:mt-4 space-y-2 sm:space-y-4'>
                  <div className='flex justify-between'>
                    <span className='text-sm text-[var(--color-text-secondary)]'>
                      Total Messages
                    </span>
                    <span className='font-semibold text-[var(--color-logic-navy)]'>
                      {stats.totalMessages}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-sm text-[var(--color-text-secondary)]'>
                      Your Messages
                    </span>
                    <span className='font-semibold text-[var(--color-logic-navy)]'>
                      {stats.userMessages}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-sm text-[var(--color-text-secondary)]'>Assistant</span>
                    <span className='font-semibold text-[var(--color-logic-navy)]'>
                      {stats.assistantMessages}
                    </span>
                  </div>
                  <div className='border-t border-[var(--color-border)] pt-2 sm:pt-4'>
                    <div className='flex justify-between'>
                      <span className='text-xs sm:text-sm text-[var(--color-text-secondary)]'>
                        Created
                      </span>
                      <span className='text-xs sm:text-sm text-[var(--color-logic-navy)]'>
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className='mt-1 sm:mt-2 flex justify-between'>
                      <span className='text-xs sm:text-sm text-[var(--color-text-secondary)]'>
                        Last Used
                      </span>
                      <span className='text-xs sm:text-sm text-[var(--color-logic-navy)]'>
                        {new Date(session.lastAccessedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Token & Swagger */}
          <div className='space-y-3 sm:space-y-6 lg:col-span-2'>
            {/* Auth Token Management */}
            <div className='rounded-lg border border-[var(--color-border)] bg-white p-3 sm:p-6'>
              <h2 className='flex items-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'>
                <Key className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                Authentication Token
              </h2>

              <div className='mt-2 sm:mt-4'>
                {session.authToken ? (
                  <div className='space-y-2 sm:space-y-3'>
                    <div className='flex items-center gap-1.5 sm:gap-2 rounded-lg bg-[var(--color-background-alt)] px-2.5 sm:px-4 py-2 sm:py-3 min-w-0 overflow-hidden'>
                      <span className='flex-1 font-mono text-xs sm:text-sm truncate min-w-0'>
                        {showToken
                          ? session.authToken
                          : '•'.repeat(Math.min(session.authToken.length, 30))}
                      </span>
                      <button
                        onClick={() => setShowToken(!showToken)}
                        className='rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] flex-shrink-0'
                        title={showToken ? 'Hide token' : 'Show token'}
                      >
                        {showToken ? (
                          <EyeOff className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                        ) : (
                          <Eye className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                        )}
                      </button>
                      <button
                        onClick={() => copyToClipboard(session.authToken!)}
                        className='rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] flex-shrink-0'
                        title='Copy token'
                      >
                        {copied ? (
                          <CheckCircle className='h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--color-circuit-green)]' />
                        ) : (
                          <Copy className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                        )}
                      </button>
                    </div>
                    <div className='flex gap-2'>
                      <button
                        onClick={handleDeleteToken}
                        className='rounded-lg border border-red-200 bg-red-50 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm text-red-600 transition-colors hover:bg-red-100'
                      >
                        Remove Token
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className='text-sm text-[var(--color-text-secondary)]'>
                    No authentication token set.
                  </p>
                )}

                <div className='mt-3 sm:mt-4 space-y-1.5 sm:space-y-2'>
                  <label className='text-xs sm:text-sm font-medium text-[var(--color-logic-navy)]'>
                    {session.authToken ? 'Update Token' : 'Set Token'}
                  </label>
                  <div className='flex flex-col sm:flex-row gap-2'>
                    <input
                      type='text'
                      value={newToken}
                      onChange={e => setNewToken(e.target.value)}
                      placeholder='Enter Bearer token...'
                      className='flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-circuit-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-circuit-green)]'
                    />
                    <button
                      onClick={handleUpdateToken}
                      disabled={isUpdatingToken || !newToken.trim()}
                      className='rounded-lg bg-[var(--color-circuit-green)] px-4 py-2 text-sm text-white transition-colors hover:bg-[var(--color-circuit-green-dark)] disabled:opacity-50 whitespace-nowrap'
                    >
                      {isUpdatingToken ? <Spinner className='h-4 w-4' /> : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Swagger Doc Viewer */}
            <div className='rounded-lg border border-[var(--color-border)] bg-white p-3 sm:p-6'>
              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
                <h2 className='flex items-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'>
                  <FileText className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                  API Documentation
                </h2>
                <div className='flex gap-2'>
                  <button
                    onClick={() => setShowSwagger(!showSwagger)}
                    className='rounded-lg border border-[var(--color-border)] bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm text-[var(--color-logic-navy)] transition-colors hover:bg-[var(--color-background-alt)] hover:text-white'
                  >
                    {showSwagger ? 'Hide' : 'View'}
                  </button>
                  <a
                    href={session.swaggerUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm text-[var(--color-logic-navy)] transition-colors hover:bg-[var(--color-background-alt)] hover:text-white'
                  >
                    <ExternalLink className='h-3 w-3' />
                    Open
                  </a>
                </div>
              </div>

              {showSwagger && swaggerDoc && (
                <div className='mt-3 sm:mt-4'>
                  <div className='rounded-lg bg-[var(--color-background-alt)] p-3 sm:p-4'>
                    <div className='mb-3 sm:mb-4'>
                      <h3 className='font-semibold text-[var(--color-logic-navy)] text-sm sm:text-base'>
                        {(swaggerDoc.info as { title?: string })?.title || 'API'}
                      </h3>
                      <p className='mt-1 text-xs sm:text-sm text-[var(--color-text-secondary)]'>
                        {(swaggerDoc.info as { description?: string })?.description ||
                          'No description available'}
                      </p>
                      <p className='mt-1 text-xs text-[var(--color-text-secondary)]'>
                        Version: {(swaggerDoc.info as { version?: string })?.version || 'N/A'}
                      </p>
                    </div>

                    {swaggerDoc.servers !== undefined && Array.isArray(swaggerDoc.servers) ? (
                      <div className='mb-3 sm:mb-4'>
                        <h4 className='text-xs sm:text-sm font-medium text-[var(--color-logic-navy)]'>
                          Servers
                        </h4>
                        <ul className='mt-1 space-y-1'>
                          {(swaggerDoc.servers as { url: string; description?: string }[]).map(
                            (server, idx) => (
                              <li
                                key={idx}
                                className='text-xs sm:text-sm text-[var(--color-text-secondary)] truncate'
                              >
                                {String(server.url)}
                                {server.description ? ` - ${String(server.description)}` : ''}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    ) : null}

                    {swaggerDoc.paths !== undefined ? (
                      <div>
                        <h4 className='text-xs sm:text-sm font-medium text-[var(--color-logic-navy)]'>
                          Endpoints
                        </h4>
                        <div className='mt-2 overflow-x-auto -mx-3 sm:mx-0'>
                          <div className='min-w-[500px] sm:min-w-0 rounded border border-[var(--color-border)] bg-white'>
                            <table className='w-full text-xs sm:text-sm'>
                              <thead className='bg-[var(--color-background-alt)]'>
                                <tr>
                                  <th className='px-2 sm:px-3 py-1.5 sm:py-2 text-left font-medium text-[var(--color-logic-navy)]'>
                                    Method
                                  </th>
                                  <th className='px-2 sm:px-3 py-1.5 sm:py-2 text-left font-medium text-[var(--color-logic-navy)]'>
                                    Path
                                  </th>
                                  <th className='px-2 sm:px-3 py-1.5 sm:py-2 text-left font-medium text-[var(--color-logic-navy)]'>
                                    Summary
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(
                                  swaggerDoc.paths as Record<
                                    string,
                                    Record<string, { summary?: string }>
                                  >
                                ).map(([path, methods]) =>
                                  Object.entries(methods).map(([method, details]) => (
                                    <tr
                                      key={`${path}-${method}`}
                                      className='border-t border-[var(--color-border)]'
                                    >
                                      <td className='px-2 sm:px-3 py-1.5 sm:py-2'>
                                        <span
                                          className={`rounded px-1.5 sm:px-2 py-0.5 text-xs font-medium ${
                                            method.toUpperCase() === 'GET'
                                              ? 'bg-blue-100 text-blue-700'
                                              : method.toUpperCase() === 'POST'
                                                ? 'bg-green-100 text-green-700'
                                                : method.toUpperCase() === 'PUT' ||
                                                    method.toUpperCase() === 'PATCH'
                                                  ? 'bg-amber-100 text-amber-700'
                                                  : method.toUpperCase() === 'DELETE'
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-gray-100 text-gray-700'
                                          }`}
                                        >
                                          {method.toUpperCase()}
                                        </span>
                                      </td>
                                      <td className='px-2 sm:px-3 py-1.5 sm:py-2 font-mono text-xs text-[var(--color-logic-navy)] truncate max-w-[150px] sm:max-w-none'>
                                        {path}
                                      </td>
                                      <td className='px-2 sm:px-3 py-1.5 sm:py-2 text-[var(--color-text-secondary)] truncate max-w-[100px] sm:max-w-none'>
                                        {details.summary || '-'}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
