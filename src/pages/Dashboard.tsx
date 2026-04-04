import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ref, onValue, push, set, query, orderByChild, equalTo, limitToLast, remove } from 'firebase/database';
import { db, loginWithGoogle } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trophy, Calendar, MapPin, PlayCircle, Swords, ArrowRight, Trash2, AlertTriangle } from 'lucide-react';
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
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [tournamentToDelete, setTournamentToDelete] = useState<string | null>(null);
  const [newTournament, setNewTournament] = useState({ name: '', location: '', startDate: '', endDate: '' });

  useEffect(() => {
    // Fetch some live matches for public view
    const matchesRef = query(ref(db, 'matches'), orderByChild('updatedAt'), limitToLast(3));
    const unsubMatches = onValue(matchesRef, (snap) => {
      const m: any[] = [];
      snap.forEach(child => {
        const val = child.val();
        if (['First Half', 'Second Half', 'Halftime'].includes(val.status)) {
          m.push({ id: child.key, ...val });
        }
      });
      setLiveMatches(m.reverse());
    });
    return () => unsubMatches();
  }, []);

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

  const handleDeleteTournament = async (id: string) => {
    if (!user) return;
    try {
      await remove(ref(db, `tournaments/${id}`));
      setTournamentToDelete(null);
    } catch (error) {
      console.error("Error deleting tournament:", error);
    }
  };

  if (!isAuthReady) return <div className="flex justify-center p-8">Loading...</div>;

  if (!user) {
    return (
      <div className="space-y-16 py-12">
        <div className="text-center max-w-4xl mx-auto px-4">
          <div className="w-20 h-20 bg-indigo-100 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl">
            <Trophy className="w-10 h-10 text-indigo-600" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter mb-6 uppercase leading-tight">
            JBMR RAID <span className="text-indigo-600">ARENA</span>
          </h1>
          <p className="text-xl text-slate-500 font-medium italic mb-10 max-w-2xl mx-auto">
            Professional Kabaddi scoring & tournament management for the digital era.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              to="/matches" 
              className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-5 h-5" /> View Live Scores
            </Link>
            <button 
              onClick={loginWithGoogle}
              className="w-full sm:w-auto px-8 py-4 bg-white border-2 border-slate-100 text-slate-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:border-indigo-600 transition-all flex items-center justify-center gap-2"
            >
              Organize Match <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {liveMatches.length > 0 && (
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8 border-b border-slate-200 pb-4">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                Live In Arena
              </h2>
              <Link to="/matches" className="text-xs font-black text-indigo-600 uppercase tracking-widest hover:translate-x-1 transition-transform flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {liveMatches.map(m => (
                <Link key={m.id} to={`/matches/${m.id}`} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl hover:shadow-2xl hover:border-indigo-200 transition-all group">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">{m.status}</span>
                    <div className="flex items-center gap-1 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                      <Swords className="w-3 h-3" /> LIVE FEED
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-tight truncate mb-2">{m.teamAName}</div>
                      <div className="text-4xl font-black text-slate-900 tabular-nums">{m.teamAScore || 0}</div>
                    </div>
                    <div className="text-[10px] font-black text-slate-300 italic">VS</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-tight truncate mb-2">{m.teamBName}</div>
                      <div className="text-4xl font-black text-slate-900 tabular-nums">{m.teamBScore || 0}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
          {[
            { title: 'Live Scoring', desc: 'Real-time raid tracking with automatic score calculation.', icon: '⚡' },
            { title: 'OBS Graphics', desc: 'Professional broadcast overlays for live streams & YouTube.', icon: '🎬' },
            { title: 'Statistics', desc: 'Full raid history and team performance analytics.', icon: '📊' }
          ].map((feature, i) => (
            <div key={i} className="bg-slate-50 p-8 rounded-3xl border border-white/40 shadow-sm text-center">
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="font-black text-slate-900 uppercase text-sm mb-2">{feature.title}</h3>
              <p className="text-slate-500 text-xs font-medium leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
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
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTournamentToDelete(tournament.id);
                  }}
                  className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
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

      {tournamentToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Delete Tournament?</h3>
            <p className="text-slate-500 font-medium italic mb-8">
              This action cannot be undone. All teams and matches associated with this tournament will remain in the database but will lose their connection to this tournament.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setTournamentToDelete(null)}
                className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTournament(tournamentToDelete)}
                className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-red-200 hover:bg-red-700 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
