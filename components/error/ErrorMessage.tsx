'use client';

import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  code?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryCount?: number;
  maxRetries?: number;
}

export function ErrorMessage({
  title = 'Error',
  message,
  code,
  onRetry,
  onDismiss,
  retryCount = 0,
  maxRetries = 3,
}: ErrorMessageProps) {
  const canRetry = retryCount < maxRetries;

  return (
    <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
      <div className='flex items-start gap-3'>
        <div className='flex-shrink-0'>
          <AlertCircle className='w-5 h-5 text-red-600 mt-0.5' />
        </div>

        <div className='flex-1 min-w-0'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-medium text-red-800'>{title}</h3>
            {code && (
              <span className='text-xs font-mono text-red-600 bg-red-100 px-2 py-0.5 rounded'>
                {code}
              </span>
            )}
          </div>

          <p className='mt-1 text-sm text-red-700'>{message}</p>

          {retryCount > 0 && (
            <p className='mt-1 text-xs text-red-600'>
              Attempt {retryCount} of {maxRetries}
            </p>
          )}

          <div className='mt-3 flex items-center gap-2'>
            {onRetry && canRetry && (
              <button
                onClick={onRetry}
                className='inline-flex items-center text-sm font-medium text-red-700 hover:text-red-800 transition-colors'
              >
                <RefreshCw className='w-4 h-4 mr-1.5' />
                Try Again
              </button>
            )}

            {onDismiss && (
              <button
                onClick={onDismiss}
                className='inline-flex items-center text-sm text-red-600 hover:text-red-700 transition-colors'
              >
                <X className='w-4 h-4 mr-1.5' />
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

export function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <div className='flex items-center justify-between bg-red-50 text-red-700 px-4 py-2 rounded text-sm'>
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className='font-medium hover:underline ml-4'>
          Retry
        </button>
      )}
    </div>
  );
}

interface ToastErrorProps {
  message: string;
  onClose: () => void;
}

export function ToastError({ message, onClose }: ToastErrorProps) {
  return (
    <div className='fixed bottom-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md animate-in slide-in-from-bottom-2'>
      <AlertCircle className='w-5 h-5 flex-shrink-0' />
      <p className='text-sm'>{message}</p>
      <button onClick={onClose} className='ml-2 hover:bg-red-700 rounded p-1 transition-colors'>
        <X className='w-4 h-4' />
      </button>
    </div>
  );
}

export default ErrorMessage;
