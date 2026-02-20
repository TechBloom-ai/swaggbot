'use client';

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  Brain,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { WorkflowProgressState, WorkflowStepProgress } from '@/lib/types';

interface WorkflowProgressProps {
  progress: WorkflowProgressState;
  result?: unknown;
}

function StepIcon({ status }: { status: WorkflowStepProgress['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className='h-4 w-4 text-[var(--color-circuit-green)]' />;
    case 'failed':
      return <XCircle className='h-4 w-4 text-red-500' />;
    case 'running':
      return <Loader2 className='h-4 w-4 text-blue-500 animate-spin' />;
    case 'pending':
    default:
      return <Circle className='h-4 w-4 text-gray-300' />;
  }
}

function StepStatusLabel({ status }: { status: WorkflowStepProgress['status'] }) {
  switch (status) {
    case 'completed':
      return <span className='text-xs text-[var(--color-circuit-green)] font-medium'>Done</span>;
    case 'failed':
      return <span className='text-xs text-red-500 font-medium'>Failed</span>;
    case 'running':
      return <span className='text-xs text-blue-500 font-medium'>Running...</span>;
    case 'pending':
    default:
      return <span className='text-xs text-gray-400'>Pending</span>;
  }
}

export function WorkflowProgress({ progress, result }: WorkflowProgressProps) {
  const { phase, steps, error } = progress;
  const isFinished = phase === 'completed' || phase === 'error';
  const [showResult, setShowResult] = useState(false);

  return (
    <div className='space-y-3'>
      {/* Planning phase */}
      {phase === 'planning' && (
        <div className='flex items-center gap-2 text-sm text-logic-navy'>
          <Brain className='h-4 w-4 animate-pulse' />
          <span className='font-medium'>Planning workflow steps...</span>
        </div>
      )}

      {/* Step list */}
      {steps.length > 0 && (
        <div className='space-y-1'>
          <div className='text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2'>
            Workflow Steps ({steps.filter(s => s.status === 'completed').length}/{steps.length})
          </div>
          <div className='relative'>
            {steps.map((step, index) => (
              <div key={step.step} className='flex items-start gap-3 relative'>
                {/* Icon */}
                <div className='relative z-10 mt-0.5 flex-shrink-0'>
                  <StepIcon status={step.status} />
                </div>

                {/* Content */}
                <div className={`flex-1 pb-3 min-w-0 ${index === steps.length - 1 ? 'pb-0' : ''}`}>
                  <div className='flex items-center justify-between gap-2'>
                    <span
                      className={`text-sm font-medium truncate ${
                        step.status === 'running'
                          ? 'text-blue-700'
                          : step.status === 'completed'
                            ? 'text-[var(--color-logic-navy)]'
                            : step.status === 'failed'
                              ? 'text-red-600'
                              : 'text-gray-400'
                      }`}
                    >
                      Step {step.step}: {step.description}
                    </span>
                    <StepStatusLabel status={step.status} />
                  </div>

                  {/* Error detail */}
                  {step.status === 'failed' && step.error && (
                    <p className='text-xs text-red-500 mt-1 break-words'>{step.error}</p>
                  )}

                  {/* HTTP code badge */}
                  {step.httpCode && step.status !== 'pending' && step.status !== 'running' && (
                    <span
                      className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-mono ${
                        step.httpCode >= 200 && step.httpCode < 300
                          ? 'bg-green-50 text-green-700'
                          : step.httpCode >= 400
                            ? 'bg-red-50 text-red-700'
                            : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      HTTP {step.httpCode}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion summary */}
      {phase === 'completed' && (
        <div
          className={`flex items-center gap-2 text-sm font-medium mt-2 pt-2 border-t border-[var(--color-border)] ${
            steps.every(s => s.status === 'completed')
              ? 'text-[var(--color-circuit-green)]'
              : 'text-red-500'
          }`}
        >
          {steps.every(s => s.status === 'completed') ? (
            <>
              <CheckCircle className='h-4 w-4' />
              Workflow completed successfully
            </>
          ) : (
            <>
              <XCircle className='h-4 w-4' />
              Workflow failed
            </>
          )}
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && error && (
        <div className='flex items-center gap-2 text-sm text-red-500 font-medium'>
          <XCircle className='h-4 w-4' />
          {error}
        </div>
      )}

      {/* Collapsible JSON result */}
      {isFinished && result !== null && result !== undefined && (
        <div className='mt-3 border-t border-[var(--color-border)] pt-2'>
          <button
            onClick={() => setShowResult(!showResult)}
            className='flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-logic-navy)] transition-colors w-full'
          >
            {showResult ? (
              <ChevronDown className='h-3.5 w-3.5' />
            ) : (
              <ChevronRight className='h-3.5 w-3.5' />
            )}
            {showResult ? 'Hide' : 'Show'} response details
          </button>
          {showResult && (
            <div className='mt-2 max-h-48 sm:max-h-64 overflow-auto rounded bg-[var(--color-background-alt)] p-2 sm:p-3'>
              <pre className='text-xs text-[var(--color-text-secondary)]'>
                {(() => {
                  try {
                    return JSON.stringify(result, null, 2);
                  } catch {
                    return String(result);
                  }
                })()}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
