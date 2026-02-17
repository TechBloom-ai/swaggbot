'use client';

import { useState, useCallback } from 'react';

import { log } from '@/lib/logger';
import { ErrorResponse } from '@/lib/errors';

interface UseApiOptions {
  maxRetries?: number;
  onError?: (error: Error) => void;
  onSuccess?: <T>(data: T) => void;
}

interface UseApiResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  errorResponse: ErrorResponse | null;
  retryCount: number;
  canRetry: boolean;
  execute: (...args: unknown[]) => Promise<T>;
  reset: () => void;
}

export function useApi<T>(
  apiFunction: (...args: unknown[]) => Promise<T>,
  options: UseApiOptions = {}
): UseApiResult<T> {
  const { maxRetries = 3, onError, onSuccess } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [errorResponse, setErrorResponse] = useState<ErrorResponse | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const reset = useCallback(() => {
    setData(null);
    setIsLoading(false);
    setError(null);
    setErrorResponse(null);
    setRetryCount(0);
  }, []);

  const execute = useCallback(
    async (...args: unknown[]): Promise<T> => {
      setIsLoading(true);
      setError(null);
      setErrorResponse(null);

      try {
        const result = await apiFunction(...args);
        setData(result);
        setRetryCount(0);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setRetryCount(prev => prev + 1);

        // Check if it's an API error response
        if (err && typeof err === 'object' && 'error' in err) {
          setErrorResponse(err as ErrorResponse);
        }

        log.error('API call failed', error, {
          retryCount: retryCount + 1,
          maxRetries,
        });

        onError?.(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiFunction, maxRetries, onError, onSuccess, retryCount]
  );

  const canRetry = retryCount < maxRetries && !!error;

  return {
    data,
    isLoading,
    error,
    errorResponse,
    retryCount,
    canRetry,
    execute,
    reset,
  };
}

export default useApi;
