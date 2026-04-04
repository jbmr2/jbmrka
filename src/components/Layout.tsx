import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loginWithGoogle, logout } from '../firebase';
import { Trophy, LogOut, LogIn } from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthReady } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors">
              <Trophy className="w-6 h-6" />
              <span className="font-bold text-xl tracking-tight">Kabaddi Pro Score</span>
            </Link>
            
            {user && (
              <Link to="/umpire" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                Umpire Panel
              </Link>
            )}
          </div>
          
          {isAuthReady && (
            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-600 hidden sm:inline-block">
                    {user.displayName || user.email}
                  </span>
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline-block">Sign Out</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={loginWithGoogle}
                  className="flex items-center gap-2 text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};
