import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ref, onValue, push, set, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trophy, Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';

interface Tournament {
  id: string;
  name: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  ownerId: string;
  createdAt: string;
}

export const Dashboard: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTournament, setNewTournament] = useState({ name: '', location: '', startDate: '', endDate: '' });

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const tournamentsRef = query(ref(db, 'tournaments'), orderByChild('ownerId'), equalTo(user.uid));
    const unsubscribe = onValue(tournamentsRef, (snapshot) => {
      const tourneys: Tournament[] = [];
      snapshot.forEach((childSnapshot) => {
        tourneys.push({ id: childSnapshot.key, ...childSnapshot.val() } as Tournament);
      });
      // Sort by created date descending
      tourneys.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setTournaments(tourneys);
    }, (error) => {
      console.error("Error fetching tournaments:", error);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTournament.name.trim()) return;

    try {
      const data: any = {
        name: newTournament.name.trim(),
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      };
      if (newTournament.location.trim()) data.location = newTournament.location.trim();
      if (newTournament.startDate) data.startDate = newTournament.startDate;
      if (newTournament.endDate) data.endDate = newTournament.endDate;
      
      const newTournamentRef = push(ref(db, 'tournaments'));
      await set(newTournamentRef, data);
      
      setIsCreating(false);
      setNewTournament({ name: '', location: '', startDate: '', endDate: '' });
    } catch (error) {
      console.error("Error creating tournament:", error);
    }
  };

  if (!isAuthReady) return <div className="flex justify-center p-8">Loading...</div>;

  if (!user) {
    return (
      <div className="text-center py-20">
        <Trophy className="w-20 h-20 text-indigo-200 mx-auto mb-6" />
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
          Professional Kabaddi Scoring
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
          Manage tournaments, teams, players, and score matches live with raid-by-raid tracking.
        </p>
        <p className="text-slate-500">Sign in to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Tournaments</h1>
          <p className="text-slate-500 mt-1">Manage your Kabaddi tournaments and matches.</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Tournament
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Create Tournament</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tournament Name *</label>
              <input
                type="text"
                required
                value={newTournament.name}
                onChange={(e) => setNewTournament({ ...newTournament, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., Pro Kabaddi League Season 10"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  value={newTournament.location}
                  onChange={(e) => setNewTournament({ ...newTournament, location: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="City, Stadium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={newTournament.startDate}
                  onChange={(e) => setNewTournament({ ...newTournament, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={newTournament.endDate}
                  onChange={(e) => setNewTournament({ ...newTournament, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {tournaments.length === 0 && !isCreating ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 border-dashed">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No tournaments yet</h3>
          <p className="text-slate-500 mb-4">Create your first tournament to get started.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Tournament
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              to={`/tournaments/${tournament.id}`}
              className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all p-6 flex flex-col h-full"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Trophy className="w-6 h-6" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 line-clamp-2">{tournament.name}</h3>
              
              <div className="mt-auto space-y-2 pt-4">
                {tournament.location && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <MapPin className="w-4 h-4" />
                    <span className="truncate">{tournament.location}</span>
                  </div>
                )}
                {(tournament.startDate || tournament.endDate) && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {tournament.startDate ? format(new Date(tournament.startDate), 'MMM d, yyyy') : 'TBD'}
                      {' - '}
                      {tournament.endDate ? format(new Date(tournament.endDate), 'MMM d, yyyy') : 'TBD'}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
