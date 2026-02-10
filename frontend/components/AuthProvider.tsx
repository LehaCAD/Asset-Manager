'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((state) => state.fetchUser);

  useEffect(() => {
    // Fetch user data on app load if token exists
    fetchUser();
  }, [fetchUser]);

  return <>{children}</>;
}
