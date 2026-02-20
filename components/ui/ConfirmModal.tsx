'use client';

import { Spinner } from './Skeleton';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  const variantStyles = {
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200',
    warning: 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200',
    default:
      'bg-[var(--color-circuit-green)] text-white hover:bg-[var(--color-circuit-green-dark)]',
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'>
      <div className='w-full max-w-md rounded-lg bg-white p-4 sm:p-6 shadow-xl'>
        <h2 className='text-lg font-semibold text-[var(--color-logic-navy)]'>{title}</h2>
        <p className='mt-2 text-sm text-[var(--color-text-secondary)] whitespace-pre-line'>
          {message}
        </p>
        <div className='mt-6 flex flex-col sm:flex-row gap-3'>
          <button
            onClick={onClose}
            disabled={isLoading}
            className='flex-1 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-[var(--color-logic-navy)] transition-colors hover:bg-[var(--color-background-alt)] disabled:opacity-50'
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${variantStyles[variant]}`}
          >
            {isLoading ? (
              <>
                <Spinner className='h-4 w-4' />
                {confirmLabel}...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
