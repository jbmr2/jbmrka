import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ref, onValue, query, orderByChild } from 'firebase/database';
import { db } from '../firebase';
import { Timer, Monitor, Tv, Calendar, Swords, PlayCircle, Clock, CheckCircle2, Trophy } from 'lucide-react';

interface Match {
  id: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  teamAScore: number;
  teamBScore: number;
  status: string;
  tournamentId?: string;
  tournamentName?: string;
  matchDate?: string;
  createdAt: string;
}

export const Matches: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState<'live' | 'upcoming' | 'past'>('live');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const matchesRef = query(ref(db, 'matches'), orderByChild('createdAt'));
    const unsub = onValue(matchesRef, (snapshot) => {
      const m: Match[] = [];
      snapshot.forEach((child) => {
        m.push({ id: child.key, ...child.val() } as Match);
      });
      // Sort by date/time (newest first)
      m.sort((a, b) => {
        const timeA = new Date(a.matchDate || a.createdAt).getTime();
        const timeB = new Date(b.matchDate || b.createdAt).getTime();
        return timeB - timeA;
      });
      setMatches(m);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching matches:", error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const categorizedMatches = matches.filter((m) => {
    if (filter === 'live') {
      return ['First Half', 'Second Half', 'Halftime'].includes(m.status);
    }
    if (filter === 'upcoming') {
      return m.status === 'Scheduled';
    }
    if (filter === 'past') {
      return m.status === 'Completed';
    }
    return false;
  });

  const getStatusColor = (status: string) => {
    if (['First Half', 'Second Half', 'Halftime'].includes(status)) return 'text-emerald-500 bg-emerald-50 border-emerald-200';
    if (status === 'Scheduled') return 'text-blue-500 bg-blue-50 border-blue-200';
    if (status === 'Completed') return 'text-slate-500 bg-slate-50 border-slate-200';
    return 'text-slate-500 bg-slate-50 border-slate-200';
  };

  if (loading) return <div className="flex justify-center p-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Matches Arena</h1>
          <p className="text-slate-500 mt-1 font-medium italic">Live scores, upcoming fixtures, and match results.</p>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200 w-fit">
          <button
            onClick={() => setFilter('live')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black uppercase text-[11px] transition-all ${
              filter === 'live' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <PlayCircle className="w-4 h-4" /> Live
          </button>
          <button
            onClick={() => setFilter('upcoming')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black uppercase text-[11px] transition-all ${
              filter === 'upcoming' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <Clock className="w-4 h-4" /> Upcoming
          </button>
          <button
            onClick={() => setFilter('past')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black uppercase text-[11px] transition-all ${
              filter === 'past' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" /> Past
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categorizedMatches.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-3xl border border-slate-200 border-dashed flex flex-col items-center justify-center">
            <Swords className="w-16 h-16 text-slate-200 mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest">No {filter} matches found</p>
          </div>
        ) : (
          categorizedMatches.map((match) => (
            <div key={match.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col group">
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex flex-col gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-widest w-fit ${getStatusColor(match.status)}`}>
                      {match.status}
                    </span>
                    {match.tournamentId && (
                      <Link to={`/tournaments/${match.tournamentId}/view`} className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-tighter flex items-center gap-1 group/link">
                        <Trophy className="w-3 h-3 group-hover/link:rotate-12 transition-transform" />
                        {match.tournamentName || 'Tournament Arena'}
                      </Link>
                    )}
                  </div>
                  {match.matchDate && (
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase tracking-tighter">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(match.matchDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4 mb-8">
                  <div className="flex-1 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mb-3 shadow-inner group-hover:scale-110 transition-transform">
                      <span className="text-2xl font-black text-indigo-600">{match.teamAName.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm line-clamp-1">{match.teamAName}</h3>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="text-4xl font-black tabular-nums flex items-center gap-4">
                      <span className="text-indigo-600">{match.teamAScore || 0}</span>
                      <span className="text-slate-300 text-xl font-light">VS</span>
                      <span className="text-orange-600">{match.teamBScore || 0}</span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-3 shadow-inner group-hover:scale-110 transition-transform">
                      <span className="text-2xl font-black text-orange-600">{match.teamBName.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm line-clamp-1">{match.teamBName}</h3>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 grid grid-cols-3 gap-3 border-t border-slate-100">
                <Link
                  to={`/obs/${match.id}`}
                  target="_blank"
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 transition-all group/btn"
                >
                  <Monitor className="w-5 h-5 text-indigo-600 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">OBS Overlay</span>
                </Link>
                <Link
                  to={`/led/${match.id}`}
                  target="_blank"
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white border border-slate-200 hover:border-orange-600 hover:bg-orange-50 transition-all group/btn"
                >
                  <Tv className="w-5 h-5 text-orange-600 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">LED Display</span>
                </Link>
                <Link
                  to={`/matches/${match.id}`}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white border border-slate-200 hover:border-emerald-600 hover:bg-emerald-50 transition-all group/btn"
                >
                  <PlayCircle className="w-5 h-5 text-emerald-600 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">View Match</span>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
