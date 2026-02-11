'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const { register, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/projects');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (password !== confirmPassword) {
      setLocalError('Пароли не совпадают');
      return;
    }

    if (password.length < 6) {
      setLocalError('Пароль должен содержать минимум 6 символов');
      return;
    }

    try {
      await register(username, email, password, confirmPassword);
      router.push('/projects');
    } catch {
      // Error handled by store
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <div className="max-w-sm w-full animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4 shadow-lg shadow-accent/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-txt-primary">Создать аккаунт</h1>
          <p className="text-sm text-txt-muted mt-1">Раскадровка</p>
        </div>

        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-txt-secondary mb-1.5">
                Имя пользователя
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
                placeholder="Логин"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-txt-secondary mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-txt-secondary mb-1.5">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
                placeholder="Минимум 6 символов"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-txt-secondary mb-1.5">
                Подтвердите пароль
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
                placeholder="Повторите пароль"
              />
            </div>

            {displayError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{displayError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isLoading ? 'Создание...' : 'Создать аккаунт'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-txt-muted mt-6">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-accent hover:text-accent-hover transition-colors font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
