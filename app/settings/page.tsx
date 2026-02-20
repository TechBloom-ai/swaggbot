'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Settings,
  Database,
  Trash2,
  RefreshCw,
  Package,
  Server,
  HardDrive,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Brain,
  Cpu,
} from 'lucide-react';

import { toast } from '@/stores/toastStore';
import { Spinner } from '@/components/ui';
import LogoutButton from '@/app/components/LogoutButton';

interface AppInfo {
  name: string;
  version: string;
  environment: string;
  nodeVersion: string;
}

interface DatabaseStats {
  sessionsCount: number;
  workflowsCount: number;
  messagesCount: number;
  databaseSize: number;
  sizeFormatted: string;
}

interface LLMInfo {
  provider: string;
  label: string;
  model: string;
  status: string;
}

interface SettingsData {
  appInfo: AppInfo;
  llm: LLMInfo;
  database: DatabaseStats;
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    success: boolean;
    deleted?: { sessions?: number; workflows?: number; messages?: number };
  } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const result = await response.json();
        const settingsData = result.data || result;
        setSettings(settingsData);
      } else {
        toast.error('Failed to load settings');
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      toast.error('Failed to load settings', 'Please check your connection');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (
      !confirm(
        'Are you sure you want to run database cleanup? This will delete:\n\n' +
          '- All sessions\n' +
          '- All Completed/failed workflows\n\n' +
          'This action cannot be undone.'
      )
    ) {
      return;
    }

    setIsCleaning(true);
    setCleanupResult(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup' }),
      });

      const result = await response.json();
      const data = result.data || result;

      if (data.success) {
        setCleanupResult({ success: true, deleted: data.deleted });
        toast.success(
          'Cleanup completed',
          `Deleted ${data.deleted.sessions || 0} sessions, ${data.deleted.workflows || 0} workflows`
        );
        // Refresh stats
        fetchSettings();
      } else {
        setCleanupResult({ success: false });
        toast.error('Cleanup failed', data.error || 'Please try again');
      }
    } catch (error) {
      console.error('Failed to run cleanup:', error);
      setCleanupResult({ success: false });
      toast.error('Cleanup failed', 'Please check your connection');
    } finally {
      setIsCleaning(false);
    }
  };

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[var(--color-background)]'>
        <Spinner className='h-8 w-8' />
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-[var(--color-background)]'>
      {/* Header */}
      <header className='border-b border-[var(--color-border)] bg-white'>
        <div className='mx-auto max-w-5xl px-3 py-3 sm:px-4 sm:py-4 lg:px-8'>
          <div className='flex items-center justify-between gap-2 sm:gap-4'>
            <div className='flex items-center gap-2 sm:gap-4'>
              <button
                onClick={() => router.push('/')}
                className='rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-alt)]'
              >
                <ArrowLeft className='h-4 w-4 sm:h-5 sm:w-5' />
              </button>
              <div className='flex items-center gap-2'>
                <Settings className='h-5 w-5 text-[var(--color-circuit-green)]' />
                <h1 className='text-lg font-semibold text-[var(--color-logic-navy)] sm:text-xl'>
                  Settings
                </h1>
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className='mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6 lg:px-8'>
        <div className='grid gap-4 sm:gap-6 lg:grid-cols-2'>
          {/* Application Info */}
          <div className='rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-6'>
            <h2 className='flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] sm:text-sm'>
              <Package className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
              Application Info
            </h2>

            <div className='mt-4 space-y-3 sm:mt-6 sm:space-y-4'>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-[var(--color-text-secondary)]'>Name</span>
                <span className='font-medium text-[var(--color-logic-navy)]'>
                  {settings?.appInfo.name}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-[var(--color-text-secondary)]'>Version</span>
                <span className='font-mono text-sm font-medium text-[var(--color-logic-navy)]'>
                  v{settings?.appInfo.version}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-[var(--color-text-secondary)]'>Environment</span>
                <span className='rounded bg-[var(--color-background-alt)] px-2 py-0.5 text-sm font-medium text-[white]'>
                  {settings?.appInfo.environment}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-[var(--color-text-secondary)]'>Node.js</span>
                <span className='font-mono text-xs text-[var(--color-text-secondary)] sm:text-sm'>
                  {settings?.appInfo.nodeVersion}
                </span>
              </div>
            </div>
          </div>

          {/* LLM Provider */}
          <div className='rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-6'>
            <h2 className='flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] sm:text-sm'>
              <Brain className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
              LLM Provider
            </h2>

            <div className='mt-4 space-y-3 sm:mt-6 sm:space-y-4'>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-[var(--color-text-secondary)]'>Provider</span>
                <span className='font-medium text-[var(--color-logic-navy)]'>
                  {settings?.llm?.label || '—'}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-[var(--color-text-secondary)]'>Model</span>
                <span className='font-mono text-sm font-medium text-[var(--color-logic-navy)]'>
                  {settings?.llm?.model || '—'}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-[var(--color-text-secondary)]'>Status</span>
                <span
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-sm font-medium ${
                    settings?.llm?.status === 'connected'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {settings?.llm?.status === 'connected' ? (
                    <Cpu className='h-3.5 w-3.5' />
                  ) : (
                    <AlertTriangle className='h-3.5 w-3.5' />
                  )}
                  {settings?.llm?.status === 'connected' ? 'Connected' : 'Error'}
                </span>
              </div>
            </div>
          </div>

          {/* Database Stats */}
          <div className='rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-6'>
            <h2 className='flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] sm:text-sm'>
              <Database className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
              Database Statistics
            </h2>

            <div className='mt-4 space-y-3 sm:mt-6 sm:space-y-4'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Server className='h-4 w-4 text-[var(--color-text-secondary)]' />
                  <span className='text-sm text-[var(--color-text-secondary)]'>Sessions</span>
                </div>
                <span className='font-semibold text-[var(--color-logic-navy)]'>
                  {settings?.database.sessionsCount.toLocaleString()}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <RefreshCw className='h-4 w-4 text-[var(--color-text-secondary)]' />
                  <span className='text-sm text-[var(--color-text-secondary)]'>Workflows</span>
                </div>
                <span className='font-semibold text-[var(--color-logic-navy)]'>
                  {settings?.database.workflowsCount.toLocaleString()}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <MessageSquare className='h-4 w-4 text-[var(--color-text-secondary)]' />
                  <span className='text-sm text-[var(--color-text-secondary)]'>Messages</span>
                </div>
                <span className='font-semibold text-[var(--color-logic-navy)]'>
                  {settings?.database.messagesCount.toLocaleString()}
                </span>
              </div>
              <div className='border-t border-[var(--color-border)] pt-3 sm:pt-4'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <HardDrive className='h-4 w-4 text-[var(--color-text-secondary)]' />
                    <span className='text-sm text-[var(--color-text-secondary)]'>
                      Database Size
                    </span>
                  </div>
                  <span className='font-semibold text-[var(--color-logic-navy)]'>
                    {settings?.database.sizeFormatted}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Database Cleanup */}
          <div className='rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-6 lg:col-span-2'>
            <h2 className='flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] sm:text-sm'>
              <Trash2 className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
              Database Cleanup
            </h2>

            <div className='mt-4 sm:mt-6'>
              <p className='text-sm text-[var(--color-text-secondary)]'>
                Clean up data to free up space. This will delete:
              </p>
              <ul className='mt-2 list-inside list-disc space-y-1 text-sm text-[var(--color-text-secondary)]'>
                <li>All sessions</li>
                <li>All completed/failed workflows</li>
                <li>All associated messages and execution logs</li>
              </ul>

              {cleanupResult && (
                <div
                  className={`mt-4 rounded-lg p-3 sm:mt-6 sm:p-4 ${
                    cleanupResult.success ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <div className='flex items-center gap-2'>
                    {cleanupResult.success ? (
                      <CheckCircle className='h-5 w-5 text-green-600' />
                    ) : (
                      <AlertTriangle className='h-5 w-5 text-red-600' />
                    )}
                    <span
                      className={`font-medium ${
                        cleanupResult.success ? 'text-green-800' : 'text-red-800'
                      }`}
                    >
                      {cleanupResult.success ? 'Cleanup completed' : 'Cleanup failed'}
                    </span>
                  </div>
                  {cleanupResult.success && cleanupResult.deleted && (
                    <div className='mt-2 text-sm text-green-700'>
                      Deleted: {cleanupResult.deleted.sessions || 0} sessions,{' '}
                      {cleanupResult.deleted.workflows || 0} workflows,{' '}
                      {cleanupResult.deleted.messages || 0} messages
                    </div>
                  )}
                </div>
              )}

              <div className='mt-4 sm:mt-6'>
                <button
                  onClick={handleCleanup}
                  disabled={isCleaning}
                  className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 sm:text-base'
                >
                  {isCleaning ? (
                    <>
                      <Spinner className='h-4 w-4' />
                      Cleaning up...
                    </>
                  ) : (
                    <>
                      <Trash2 className='h-4 w-4' />
                      Run Cleanup
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
