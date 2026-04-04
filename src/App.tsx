import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TournamentDetails } from './pages/TournamentDetails';
import { TeamDetails } from './pages/TeamDetails';
import { LiveScoring } from './pages/LiveScoring';
import { ObsOverlay } from './pages/ObsOverlay';
import { LedDisplay } from './pages/LedDisplay';
import { UmpirePanel } from './pages/UmpirePanel';
import { Matches } from './pages/Matches';
import { MatchDetails } from './pages/MatchDetails';
import { TournamentView } from './pages/TournamentView';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAuthReady } = useAuth();
  
  if (!isAuthReady) return <div className="flex justify-center p-8">Loading...</div>;
  if (!user) return <Navigate to="/" />;
  
  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* OBS Overlays - No Layout, No Auth Required */}
            <Route path="/obs/:id" element={<ObsOverlay />} />
            <Route path="/led/:id" element={<LedDisplay />} />
            
            {/* Main App Routes */}
            <Route path="/*" element={
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/matches" element={<Matches />} />
                  <Route path="/matches/:id" element={<MatchDetails />} />
                  <Route path="/tournaments/:id/view" element={<TournamentView />} />
                  <Route path="/umpire" element={<ProtectedRoute><UmpirePanel /></ProtectedRoute>} />
                  <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetails /></ProtectedRoute>} />
                  <Route path="/teams/:id" element={<ProtectedRoute><TeamDetails /></ProtectedRoute>} />
                  <Route path="/matches/:id/score" element={<ProtectedRoute><LiveScoring /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
