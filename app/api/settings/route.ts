import { NextRequest } from 'next/server';

import { cleanupService } from '@/lib/services/cleanup';
import { handleApiError, createSuccessResponse } from '@/lib/errors';
import { log } from '@/lib/logger';
import { getLLMProvider, type LLMProviderType } from '@/lib/llm';

// Map provider names to display-friendly labels
const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  moonshot: 'Moonshot AI (Kimi)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama (Local)',
};

// GET /api/settings - Get application info and database stats
export async function GET() {
  try {
    log.info('Fetching settings and database stats');

    const stats = await cleanupService.getStats();

    const appInfo = {
      name: 'Swaggbot',
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
    };

    // LLM provider info
    let llmInfo: { provider: string; label: string; model: string; status: string };
    try {
      const provider = getLLMProvider();
      const providerName = provider.name as LLMProviderType;
      llmInfo = {
        provider: providerName,
        label: PROVIDER_LABELS[providerName] || providerName,
        model: getProviderModel(providerName),
        status: 'connected',
      };
    } catch {
      const providerName = (process.env.LLM_PROVIDER || 'moonshot') as LLMProviderType;
      llmInfo = {
        provider: providerName,
        label: PROVIDER_LABELS[providerName] || providerName,
        model: getProviderModel(providerName),
        status: 'error',
      };
    }

    return createSuccessResponse({
      appInfo,
      llm: llmInfo,
      database: {
        ...stats,
        sizeFormatted: formatBytes(stats.databaseSize),
      },
    });
  } catch (error) {
    log.error('Failed to get settings', error);
    return handleApiError(error);
  }
}

// POST /api/settings - Run database cleanup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'cleanup') {
      log.info('Running database cleanup');
      const result = await cleanupService.runFullCleanup();

      if (result.success) {
        return createSuccessResponse({
          success: true,
          message: 'Cleanup completed successfully',
          deleted: {
            sessions: result.deletedSessions,
            workflows: result.deletedWorkflows,
            messages: result.deletedMessages,
          },
        });
      } else {
        return createSuccessResponse(
          {
            success: false,
            error: result.error,
          },
          500
        );
      }
    }

    if (action === 'stats') {
      const stats = await cleanupService.getStats();
      return createSuccessResponse({ stats });
    }

    return createSuccessResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    log.error('Failed to run cleanup', error);
    return handleApiError(error);
  }
}

function getProviderModel(provider: string): string {
  switch (provider) {
    case 'moonshot':
      return process.env.MOONSHOT_MODEL || 'kimi-k2.5';
    case 'openai':
      return process.env.OPENAI_MODEL || 'gpt-4o';
    case 'anthropic':
      return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    case 'ollama':
      return process.env.OLLAMA_MODEL || 'llama3.1';
    default:
      return 'unknown';
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
