'use client';

import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

import { useToastStore, ToastType } from '@/stores/toastStore';

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className='h-5 w-5 text-green-600' />,
  error: <AlertCircle className='h-5 w-5 text-red-600' />,
  warning: <AlertTriangle className='h-5 w-5 text-amber-600' />,
  info: <Info className='h-5 w-5 text-blue-600' />,
};

const toastStyles: Record<ToastType, string> = {
  success: 'border-green-300 bg-green-100',
  error: 'border-red-300 bg-red-100',
  warning: 'border-amber-300 bg-amber-100',
  info: 'border-blue-300 bg-blue-100',
};

function ToastItem({
  id,
  type,
  title,
  message,
}: {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}) {
  const removeToast = useToastStore(state => state.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [id, removeToast]);

  return (
    <div
      className={`pointer-events-auto w-[calc(100vw-2rem)] sm:w-96 overflow-hidden rounded-lg border shadow-xl transition-all animate-in slide-in-from-right-full ${toastStyles[type]}`}
      role='alert'
    >
      <div className='p-4'>
        <div className='flex items-start'>
          <div className='flex-shrink-0'>{toastIcons[type]}</div>
          <div className='ml-3 w-0 flex-1 pt-0.5'>
            <p className='text-sm font-semibold text-gray-900'>{title}</p>
            {message && <p className='mt-1 text-sm text-gray-700'>{message}</p>}
          </div>
          <div className='ml-4 flex flex-shrink-0'>
            <button
              onClick={() => removeToast(id)}
              className='inline-flex rounded-md text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
            >
              <span className='sr-only'>Close</span>
              <X className='h-5 w-5' />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore(state => state.toasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className='fixed bottom-4 right-4 z-50 flex flex-col gap-3 w-auto'>
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
        />
      ))}
    </div>
  );
}

export default ToastContainer;
