'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className='rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-background-alt)] p-12 text-center'>
      <Icon className='mx-auto h-12 w-12 text-[var(--color-text-secondary)]' />
      <h3 className='mt-4 text-lg font-medium text-[var(--color-logic-navy)]'>{title}</h3>
      <p className='mt-2 text-[var(--color-text-secondary)]'>{description}</p>
      <div className='mt-4 flex flex-col gap-3 justify-center'>
        {action && (
          <button
            onClick={action.onClick}
            className='rounded-lg bg-[var(--color-circuit-green)] px-4 py-2 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)]'
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

interface EmptyStateCompactProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyStateCompact({ icon: Icon, title, description }: EmptyStateCompactProps) {
  return (
    <div className='flex flex-col items-center justify-center py-8 text-center'>
      <Icon className='h-8 w-8 text-[var(--color-text-secondary)]' />
      <h4 className='mt-2 text-sm font-medium text-[var(--color-logic-navy)]'>{title}</h4>
      {description && (
        <p className='mt-1 text-xs text-[var(--color-text-secondary)]'>{description}</p>
      )}
    </div>
  );
}

export default EmptyState;
