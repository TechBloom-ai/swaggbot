'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className='flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-[var(--color-logic-navy)] transition-colors hover:bg-[var(--color-background-alt)] hover:text-white'
    >
      {isLoading ? 'Logging out...' : 'Logout'}
    </button>
  );
}
