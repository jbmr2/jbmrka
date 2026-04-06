import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../firebase';
import { Swords, Trophy, Calendar, MapPin, ArrowLeft, Monitor, Tv, History, Timer } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

interface Match {
  id: string;
  teamAId: string;
  teamBId: string;
  teamAName?: string;
  teamBName?: string;
  teamAScore?: number;
  teamBScore?: number;
  status?: string;
  matchDate?: string;
  createdAt?: string;
}

export const TournamentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'matches' | 'standings'>('matches');

  useEffect(() => {
    if (!id) return;

    // Fetch tournament details
    const tournamentRef = ref(db, `tournaments/${id}`);
    const unsubTournament = onValue(tournamentRef, (snapshot) => {
      if (snapshot.exists()) {
        setTournament({ id: snapshot.key, ...snapshot.val() });
      } else {
        setLoading(false);
      }
    }, (error) => {
      console.error("Error fetching tournament:", error);
      setLoading(false);
    });

    // Fetch teams
    const teamsQ = query(ref(db, 'teams'), orderByChild('tournamentId'), equalTo(id));
    const unsubTeams = onValue(teamsQ, (snapshot) => {
      const t: Team[] = [];
      snapshot.forEach(child => {
        t.push({ id: child.key, ...child.val() } as Team);
      });
      setTeams(t);
    });

    // Fetch matches
    const matchesQ = query(ref(db, 'matches'), orderByChild('tournamentId'), equalTo(id));
    const unsubMatches = onValue(matchesQ, (snapshot) => {
      const m: Match[] = [];
      snapshot.forEach(child => {
        m.push({ id: child.key, ...child.val() } as Match);
      });
      m.sort((a: any, b: any) => {
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

    return () => {
      unsubTournament();
      unsubTeams();
      unsubMatches();
    };
  }, [id]);

  const calculatePointsTable = () => {
    const table: Record<string, { id: string, name: string, logoUrl?: string, played: number, won: number, lost: number, drawn: number, points: number, diff: number }> = {};
    
    teams.forEach(t => {
      table[t.id] = { id: t.id, name: t.name, logoUrl: t.logoUrl, played: 0, won: 0, lost: 0, drawn: 0, points: 0, diff: 0 };
    });

    matches.filter(m => m.status === 'Completed').forEach(m => {
      if (table[m.teamAId] && table[m.teamBId]) {
        table[m.teamAId].played += 1;
        table[m.teamBId].played += 1;
        
        const scoreA = m.teamAScore || 0;
        const scoreB = m.teamBScore || 0;
        
        table[m.teamAId].diff += (scoreA - scoreB);
        table[m.teamBId].diff += (scoreB - scoreA);

        if (scoreA > scoreB) {
          table[m.teamAId].won += 1;
          table[m.teamAId].points += 5; // PKL Style
          if (scoreA - scoreB <= 7) table[m.teamBId].points += 1;
          table[m.teamBId].lost += 1;
        } else if (scoreB > scoreA) {
          table[m.teamBId].won += 1;
          table[m.teamBId].points += 5;
          if (scoreB - scoreA <= 7) table[m.teamAId].points += 1;
          table[m.teamAId].lost += 1;
        } else {
          table[m.teamAId].drawn += 1;
          table[m.teamBId].drawn += 1;
          table[m.teamAId].points += 3;
          table[m.teamBId].points += 3;
        }
      }
    });

    return Object.values(table).sort((a, b) => b.points - a.points || b.diff - a.diff);
  };

  if (loading) return <div className="flex justify-center p-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  if (!tournament) {
    return (
      <div className="text-center py-20 px-4">
        <Trophy className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-900 uppercase mb-2">Tournament Not Found</h2>
        <p className="text-slate-500 mb-8">This tournament record does not exist or has been removed.</p>
        <Link to="/matches" className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg">Go to Matches</Link>
      </div>
    );
  }

  const pointsTable = calculatePointsTable();

  return (
    <div className="space-y-8 max-w-6xl mx-auto px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Link to="/matches" className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-tight">{tournament.name}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
              {tournament.location && (
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-indigo-500" /> {tournament.location}</span>
              )}
              {tournament.startDate && (
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-indigo-500" /> {new Date(tournament.startDate).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0">
          <button 
            onClick={() => setActiveTab('matches')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'matches' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}
          >
            Matches
          </button>
          <button 
            onClick={() => setActiveTab('standings')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'standings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}
          >
            Standings
          </button>
        </div>
      </div>

      {activeTab === 'matches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-3xl border border-slate-100 text-slate-400 font-bold uppercase text-xs tracking-widest">No matches found for this tournament.</div>
          ) : (
            matches.map(match => (
              <Link
                key={match.id}
                to={`/matches/${match.id}`}
                className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all group"
              >
                <div className="flex justify-between items-center mb-6">
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border tracking-widest ${
                    match.status === 'Completed' ? 'bg-slate-50 text-slate-400' : 'bg-emerald-50 text-emerald-600 border-emerald-100 animate-pulse'
                  }`}>
                    {match.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5 text-indigo-300 group-hover:text-indigo-600 transition-colors" />
                    <Tv className="w-3.5 h-3.5 text-orange-300 group-hover:text-orange-600 transition-colors" />
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-slate-900 uppercase text-[11px] truncate mb-2">{match.teamAName}</div>
                    <div className="text-4xl font-black text-indigo-600 tabular-nums">{match.teamAScore || 0}</div>
                  </div>
                  <div className="text-[10px] font-black text-slate-300">VS</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-slate-900 uppercase text-[11px] truncate mb-2">{match.teamBName}</div>
                    <div className="text-4xl font-black text-orange-600 tabular-nums">{match.teamBScore || 0}</div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {activeTab === 'standings' && (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10px] font-black tracking-widest">
                  <th className="px-6 py-4">#</th>
                  <th className="px-6 py-4">Team</th>
                  <th className="px-6 py-4 text-center">P</th>
                  <th className="px-6 py-4 text-center">W</th>
                  <th className="px-6 py-4 text-center">L</th>
                  <th className="px-6 py-4 text-center">D</th>
                  <th className="px-6 py-4 text-center">Diff</th>
                  <th className="px-6 py-4 text-center bg-indigo-600">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pointsTable.map((team, index) => (
                  <tr key={team.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-5 font-black text-slate-300 group-hover:text-slate-900">{index + 1}</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        {team.logoUrl ? (
                          <img src={team.logoUrl} className="w-8 h-8 rounded-full shadow-inner" alt="logo" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-[10px] text-slate-400 uppercase">{team.name.substring(0, 2)}</div>
                        )}
                        <span className="font-black text-slate-900 uppercase text-[11px] tracking-tight">{team.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center text-xs font-bold text-slate-600">{team.played}</td>
                    <td className="px-6 py-5 text-center text-xs font-bold text-emerald-600">{team.won}</td>
                    <td className="px-6 py-5 text-center text-xs font-bold text-red-500">{team.lost}</td>
                    <td className="px-6 py-5 text-center text-xs font-bold text-slate-400">{team.drawn}</td>
                    <td className={`px-6 py-5 text-center text-xs font-black tabular-nums ${team.diff > 0 ? 'text-indigo-600' : team.diff < 0 ? 'text-orange-500' : 'text-slate-400'}`}>
                      {team.diff > 0 ? `+${team.diff}` : team.diff}
                    </td>
                    <td className="px-6 py-5 text-center font-black text-lg text-indigo-600 bg-indigo-50/30">{team.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
