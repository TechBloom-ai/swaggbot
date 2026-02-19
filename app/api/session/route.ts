import { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionService } from '@/lib/services/session';
import {
  handleApiError,
  createSuccessResponse,
  ValidationError,
  ExternalServiceError,
} from '@/lib/errors';
import { log } from '@/lib/logger';
import { validateSwaggerUrlFull } from '@/lib/utils/url-validator';

const createSessionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  swaggerUrl: z.string().url('Invalid URL format'),
});

// GET /api/session - List all sessions
export async function GET() {
  try {
    log.info('Fetching all sessions');

    const sessions = await sessionService.findAll();

    log.info('Sessions fetched', { count: sessions.length });

    return createSuccessResponse({ sessions });
  } catch (error) {
    log.error('Failed to list sessions', error, { route: 'GET /api/session' });
    return handleApiError(error);
  }
}

// POST /api/session - Create a new session
export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }

    // Validate input
    const validation = createSessionSchema.safeParse(body);
    if (!validation.success) {
      const fields: Record<string, string[]> = {};
      validation.error.issues.forEach(err => {
        const path = err.path.map(String).join('.');
        if (!fields[path]) {
          fields[path] = [];
        }
        fields[path].push(err.message);
      });
      throw new ValidationError('Invalid input', fields);
    }

    // Validate URL security (protocol and IP restrictions)
    const urlValidation = validateSwaggerUrlFull(validation.data.swaggerUrl);
    if (!urlValidation.valid) {
      throw new ValidationError('Invalid URL', { swaggerUrl: [urlValidation.error!] });
    }

    log.info('Creating new session', {
      name: validation.data.name,
      swaggerUrl: validation.data.swaggerUrl,
    });

    const session = await sessionService.create(validation.data);

    log.info('Session created', { sessionId: session.id });

    return createSuccessResponse({ session }, 201);
  } catch (error) {
    log.error('Failed to create session', error, { route: 'POST /api/session' });

    if (error instanceof Error && error.message.includes('fetch')) {
      return handleApiError(new ExternalServiceError('swagger', error));
    }

    return handleApiError(error);
  }
}
