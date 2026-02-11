'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth';
import { useState } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-surface-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          {/* Left section */}
          <div className="flex items-center gap-6">
            <Link href="/projects" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-txt-primary hidden sm:block">
                Раскадровка
              </span>
            </Link>

            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-1">
              <Link
                href="/projects"
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  pathname?.startsWith('/projects')
                    ? 'text-txt-primary bg-surface-tertiary font-medium'
                    : 'text-txt-muted hover:text-txt-secondary hover:bg-surface-tertiary'
                }`}
              >
                Проекты
              </Link>
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-accent">
                    {user?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-txt-secondary hidden sm:block">
                  {user?.username}
                </span>
                <svg className="w-4 h-4 text-txt-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-surface-border shadow-lg z-50 animate-slide-down overflow-hidden">
                    <div className="px-4 py-3 border-b border-surface-border">
                      <p className="text-sm font-medium text-txt-primary truncate">{user?.username}</p>
                      <p className="text-xs text-txt-muted truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Выйти
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
