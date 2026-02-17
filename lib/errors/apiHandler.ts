import { NextResponse } from 'next/server';

import { log } from '@/lib/logger';

import { AppError, NotFoundError } from './AppError';

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  retry?: {
    allowed: boolean;
    after?: number;
  };
}

export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: Record<string, unknown> | undefined;
  let retryAllowed = false;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;

    if ('fields' in error) {
      details = { fields: (error as { fields: Record<string, string[]> }).fields };
    }

    if ('exitCode' in error && 'stderr' in error) {
      details = {
        ...details,
        exitCode: (error as unknown as { exitCode: number }).exitCode,
        stderr: (error as unknown as { stderr: string }).stderr,
      };
    }

    retryAllowed = error.isOperational && statusCode >= 500;

    if (error.isOperational) {
      log.warn(`Operational error: ${code}`, { message, statusCode });
    } else {
      log.error(`Non-operational error: ${code}`, error);
    }
  } else if (error instanceof Error) {
    message = error.message;
    log.error('Unhandled error in API route', error);
  } else {
    log.error('Unknown error type in API route', error);
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    ...(retryAllowed && {
      retry: {
        allowed: true,
        after: 1,
      },
    }),
  };

  return NextResponse.json(response, { status: statusCode });
}

export function createSuccessResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function assertNonNull<T>(
  value: T | null | undefined,
  resource: string,
  identifier?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource, identifier);
  }
}

export function assertCondition(
  condition: boolean,
  message: string,
  code: string = 'BAD_REQUEST',
  statusCode: number = 400
): asserts condition {
  if (!condition) {
    throw new AppError(message, code, statusCode, true);
  }
}
