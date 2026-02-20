'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch {
      setError('Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-[var(--color-background)]'>
      <div className='w-full max-w-md p-8 bg-white rounded-2xl shadow-xl'>
        <div className='text-center mb-8'>
          <h1 className='text-3xl font-bold text-gray-900 mb-2'>
            <span className='text-[var(--color-circuit-green)]'>Swagg</span>
            <span className='text-[var(--color-logic-navy)]'>Bot</span>
          </h1>
          <p className='text-gray-600'>API Testing Assistant</p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-6'>
          <div>
            <label htmlFor='password' className='block text-sm font-medium text-gray-700 mb-2'>
              Password
            </label>
            <input
              id='password'
              type='password'
              value={password}
              onChange={e => setPassword(e.target.value)}
              className='w-full px-4 py-3 text-logic-navy border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all'
              placeholder='Enter your password'
              required
              autoFocus
            />
          </div>

          {error && (
            <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
              {error}
            </div>
          )}

          <button
            type='submit'
            disabled={isLoading}
            className='w-full py-3 px-4 bg-[var(--color-circuit-green)] hover:bg-[var(--color-circuit-green-dark)] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {isLoading ? 'Authenticating...' : 'Login'}
          </button>
        </form>

        <div className='mt-6 text-center text-sm text-gray-500'>
          <p>Protected by application password</p>
        </div>
      </div>
    </div>
  );
}
