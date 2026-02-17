'use client';

import { useState, useCallback } from 'react';

import { log } from '@/lib/logger';

interface UseRetryOptions {
  maxRetries?: number;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
}

interface UseRetryResult<T extends (...args: unknown[]) => Promise<unknown>> {
  execute: T;
  isLoading: boolean;
  error: Error | null;
  retryCount: number;
  canRetry: boolean;
  reset: () => void;
}

export function useRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  asyncFunction: T,
  options: UseRetryOptions = {}
): UseRetryResult<T> {
  const { maxRetries = 3, onError, onSuccess } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setRetryCount(0);
  }, []);

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await asyncFunction(...args);
        setRetryCount(0);
        onSuccess?.();
        return result as ReturnType<T>;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setRetryCount(prev => prev + 1);

        log.error('Async operation failed', error, {
          retryCount: retryCount + 1,
          maxRetries,
        });

        onError?.(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFunction, maxRetries, onError, onSuccess, retryCount]
  ) as T;

  const canRetry = retryCount < maxRetries;

  return {
    execute,
    isLoading,
    error,
    retryCount,
    canRetry,
    reset,
  };
}

export default useRetry;
