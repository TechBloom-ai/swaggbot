'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />;
}

export function SessionCardSkeleton() {
  return (
    <div className='rounded-lg border border-[var(--color-border)] bg-white p-6 shadow-sm'>
      <div className='flex items-start justify-between'>
        <div className='flex items-center gap-3'>
          <Skeleton className='h-10 w-10 rounded-lg' />
          <div>
            <Skeleton className='h-5 w-32 mb-2' />
            <Skeleton className='h-4 w-24' />
          </div>
        </div>
        <Skeleton className='h-8 w-8 rounded' />
      </div>
      <Skeleton className='mt-3 h-4 w-full' />
    </div>
  );
}

export function SessionListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: count }).map((_, i) => (
        <SessionCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className='flex gap-3 items-center'>
      <Skeleton className='h-8 w-8 rounded-full flex-shrink-0' />
      <div className='max-w-[80%] rounded-lg px-4 py-3 bg-white border border-[var(--color-border)] w-full'>
        <Skeleton className='h-4 w-3/4 mb-2' />
        <Skeleton className='h-4 w-1/2' />
      </div>
    </div>
  );
}

export function ChatPageSkeleton() {
  return (
    <div className='flex h-screen flex-col bg-[var(--color-background)]'>
      {/* Header Skeleton */}
      <header className='border-b border-[var(--color-border)] bg-white px-4 py-3'>
        <div className='mx-auto flex max-w-4xl items-center justify-between'>
          <div className='flex items-center gap-3'>
            <Skeleton className='h-10 w-10 rounded-lg' />
            <div>
              <Skeleton className='h-5 w-40 mb-1' />
              <Skeleton className='h-3 w-64' />
            </div>
          </div>
          <Skeleton className='h-6 w-24' />
        </div>
      </header>

      {/* Messages Skeleton */}
      <div className='flex-1 overflow-y-auto px-4 py-6'>
        <div className='mx-auto max-w-4xl space-y-6'>
          <MessageSkeleton />
          <MessageSkeleton />
          <MessageSkeleton />
        </div>
      </div>

      {/* Input Skeleton */}
      <div className='border-t border-[var(--color-border)] px-4 py-4'>
        <div className='mx-auto flex max-w-4xl gap-3'>
          <Skeleton className='flex-1 h-12 rounded-lg' />
          <Skeleton className='h-12 w-24 rounded-lg' />
        </div>
      </div>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-4 border-white border-t-transparent ${className}`}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className='flex h-screen items-center justify-center'>
      <Spinner className='h-8 w-8' />
    </div>
  );
}

export function InlineSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Spinner className='h-5 w-5' />
    </div>
  );
}

export default Skeleton;
