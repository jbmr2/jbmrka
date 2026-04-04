import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, query, orderByChild, equalTo, get, remove } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Swords, Plus, ArrowLeft, Shield, Trash2, AlertTriangle, Calendar, Timer, Monitor, Tv, BarChart3, GitGraph, Volume2, VolumeX } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  shortName?: string;
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

export const TournamentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeTab, setActiveTab] = useState<'matches' | 'teams' | 'points' | 'bracket'>('matches');
  const [tournamentAudio, setTournamentAudio] = useState(true);
  
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', shortName: '' });
  
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({ 
    teamAId: '', 
    teamBId: '', 
    durationMinutes: 45,
    matchDate: new Date().toISOString().slice(0, 16) // Default to now
  });
  const [matchToDelete, setMatchToDelete] = useState<string | null>(null);

  const confirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    try {
      await remove(ref(db, `matches/${matchToDelete}`));
      setMatchToDelete(null);
    } catch (error) {
      console.error("Error deleting match:", error);
    }
  };

  useEffect(() => {
    if (!id || !user) return;

    // Fetch tournament details
    const fetchTournament = async () => {
      try {
        const docRef = ref(db, `tournaments/${id}`);
        const docSnap = await get(docRef);
        if (docSnap.exists()) {
          const data = docSnap.val();
          setTournament({ id: docSnap.key, ...data });
          setTournamentAudio(data.audioEnabled !== false);
        } else {
          navigate('/');
        }
      } catch (error) {
        console.error("Error fetching tournament:", error);
      }
    };
    fetchTournament();

    // Listen to teams
    const teamsQ = query(ref(db, 'teams'), orderByChild('tournamentId'), equalTo(id));
    const unsubTeams = onValue(teamsQ, (snapshot) => {
      const t: Team[] = [];
      snapshot.forEach(childSnapshot => {
        t.push({ id: childSnapshot.key, ...childSnapshot.val() } as Team);
      });
      setTeams(t);
    }, (error) => console.error("Error fetching teams:", error));

    // Listen to matches
    const matchesQ = query(ref(db, 'matches'), orderByChild('tournamentId'), equalTo(id));
    const unsubMatches = onValue(matchesQ, (snapshot) => {
      const m: Match[] = [];
      snapshot.forEach(childSnapshot => {
        m.push({ id: childSnapshot.key, ...childSnapshot.val() } as Match);
      });
      // Sort matches by creation date descending
      m.sort((a: any, b: any) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setMatches(m);
    }, (error) => console.error("Error fetching matches:", error));

    return () => {
      unsubTeams();
      unsubMatches();
    };
  }, [id, user, navigate]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !newTeam.name.trim()) return;

    try {
      const data: any = {
        name: newTeam.name.trim(),
        tournamentId: id,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      };
      if (newTeam.shortName.trim()) data.shortName = newTeam.shortName.trim();
      
      const newTeamRef = push(ref(db, 'teams'));
      await set(newTeamRef, data);
      
      setIsCreatingTeam(false);
      setNewTeam({ name: '', shortName: '' });
    } catch (error) {
      console.error("Error creating team:", error);
    }
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !newMatch.teamAId || !newMatch.teamBId) return;
    if (newMatch.teamAId === newMatch.teamBId) {
      alert("Please select two different teams.");
      return;
    }

    const teamA = teams.find(t => t.id === newMatch.teamAId);
    const teamB = teams.find(t => t.id === newMatch.teamBId);

    try {
      const durationSeconds = (newMatch.durationMinutes || 45) * 60;
      const data: any = {
        tournamentId: id,
        teamAId: newMatch.teamAId,
        teamBId: newMatch.teamBId,
        teamAScore: 0,
        teamBScore: 0,
        status: 'Scheduled',
        timerSeconds: durationSeconds,
        initialTimerSeconds: durationSeconds, // Store the initial duration
        isTimerRunning: false,
        ownerId: user.uid,
        matchDate: newMatch.matchDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (teamA?.name) data.teamAName = teamA.name;
      if (teamB?.name) data.teamBName = teamB.name;
      
      const newMatchRef = push(ref(db, 'matches'));
      await set(newMatchRef, data);
      
      setIsCreatingMatch(false);
      setNewMatch({ 
        teamAId: '', 
        teamBId: '', 
        durationMinutes: 45,
        matchDate: new Date().toISOString().slice(0, 16)
      });
    } catch (error) {
      console.error("Error creating match:", error);
    }
  };

  if (!tournament) return <div className="flex justify-center p-8">Loading...</div>;

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
          table[m.teamAId].points += 5; // PKL Style: Win = 5 pts
          if (scoreA - scoreB <= 7) {
            table[m.teamBId].points += 1; // Loss by 7 or less = 1 pt
          }
          table[m.teamBId].lost += 1;
        } else if (scoreB > scoreA) {
          table[m.teamBId].won += 1;
          table[m.teamBId].points += 5;
          if (scoreB - scoreA <= 7) {
            table[m.teamAId].points += 1;
          }
          table[m.teamAId].lost += 1;
        } else {
          table[m.teamAId].drawn += 1;
          table[m.teamBId].drawn += 1;
          table[m.teamAId].points += 3; // Draw = 3 pts
          table[m.teamBId].points += 3;
        }
      }
    });

    return Object.values(table).sort((a, b) => b.points - a.points || b.diff - a.diff);
  };

  const pointsTable = calculatePointsTable();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{tournament.name}</h1>
            <p className="text-slate-500 mt-1">Tournament Management & Analytics</p>
          </div>
        </div>

        <button 
          onClick={async () => {
            const newState = !tournamentAudio;
            setTournamentAudio(newState);
            try {
              await set(ref(db, `tournaments/${id}/audioEnabled`), newState);
            } catch (error) {
              console.error("Error updating audio state:", error);
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-lg ${tournamentAudio ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
        >
          {tournamentAudio ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          Audio {tournamentAudio ? 'ON' : 'OFF'}
        </button>

        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button 
            onClick={() => setActiveTab('matches')}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'matches' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
          >
            Matches
          </button>
          <button 
            onClick={() => setActiveTab('teams')}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'teams' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
          >
            Teams
          </button>
          <button 
            onClick={() => setActiveTab('points')}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'points' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
          >
            Standings
          </button>
          <button 
            onClick={() => setActiveTab('bracket')}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'bracket' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
          >
            Bracket
          </button>
        </div>
      </div>

      {activeTab === 'matches' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
              <Swords className="w-5 h-5 text-orange-600" />
              Tournament Matches ({matches.length})
            </h2>
            <button
              onClick={() => setIsCreatingMatch(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700 transition-all shadow-lg"
            >
              + Create Match
            </button>
          </div>

          {isCreatingMatch && (
            <form onSubmit={handleCreateMatch} className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Team A *</label>
                  <select
                    required
                    value={newMatch.teamAId}
                    onChange={(e) => setNewMatch({ ...newMatch, teamAId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Select Team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Team B *</label>
                  <select
                    required
                    value={newMatch.teamBId}
                    onChange={(e) => setNewMatch({ ...newMatch, teamBId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Select Team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newMatch.matchDate}
                    onChange={(e) => setNewMatch({ ...newMatch, matchDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Duration (mins) *</label>
                  <input
                    type="number"
                    required
                    value={newMatch.durationMinutes}
                    onChange={(e) => setNewMatch({ ...newMatch, durationMinutes: parseInt(e.target.value) || 45 })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsCreatingMatch(false)} className="px-4 py-2 text-xs font-black uppercase text-slate-500 hover:text-slate-800">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700">Create Match</button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.length === 0 ? (
              <p className="col-span-full text-slate-400 font-bold uppercase text-center py-12">No matches scheduled yet.</p>
            ) : (
              matches.map(match => (
                <Link
                  key={match.id}
                  to={`/matches/${match.id}/score`}
                  className="p-4 rounded-2xl border border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase border tracking-widest ${
                      match.status === 'Completed' ? 'bg-slate-50 text-slate-400' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {match.status}
                    </span>
                    <div className="flex items-center gap-2">
                      <Link to={`/obs/${match.id}`} target="_blank" className="p-1.5 text-indigo-400 hover:text-indigo-600"><Monitor className="w-3.5 h-3.5" /></Link>
                      <Link to={`/led/${match.id}`} target="_blank" className="p-1.5 text-orange-400 hover:text-orange-600"><Tv className="w-3.5 h-3.5" /></Link>
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMatchToDelete(match.id); }} className="p-1.5 text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-slate-900 uppercase text-[11px] truncate">{match.teamAName}</div>
                      <div className="text-2xl font-black text-indigo-600 mt-1">{match.teamAScore || 0}</div>
                    </div>
                    <div className="text-[10px] font-black text-slate-300">VS</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-slate-900 uppercase text-[11px] truncate">{match.teamBName}</div>
                      <div className="text-2xl font-black text-orange-600 mt-1">{match.teamBScore || 0}</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'teams' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
              <Shield className="w-5 h-5 text-indigo-600" />
              Tournament Teams ({teams.length})
            </h2>
            <button
              onClick={() => setIsCreatingTeam(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700 transition-all shadow-lg"
            >
              + Add Team
            </button>
          </div>

          {isCreatingTeam && (
            <form onSubmit={handleCreateTeam} className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Team Name *</label>
                  <input
                    type="text"
                    required
                    value={newTeam.name}
                    onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Short Name</label>
                  <input
                    type="text"
                    value={newTeam.shortName}
                    onChange={(e) => setNewTeam({ ...newTeam, shortName: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsCreatingTeam(false)} className="px-4 py-2 text-xs font-black uppercase text-slate-500 hover:text-slate-800">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700">Add Team</button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {teams.map(team => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className="p-6 rounded-2xl border border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 text-center transition-all group"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-700 font-black text-xl border border-indigo-100 mx-auto mb-4 group-hover:scale-110 transition-transform">
                  {team.shortName || team.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="font-black text-slate-900 uppercase text-sm truncate">{team.name}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'points' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              Points Table
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Pos</th>
                  <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Team</th>
                  <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">P</th>
                  <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">W</th>
                  <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">L</th>
                  <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">D</th>
                  <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">SD</th>
                  <th className="py-4 text-[10px] font-black text-emerald-500 uppercase tracking-widest text-center">PTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pointsTable.map((team, index) => (
                  <tr key={team.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-4 font-black text-slate-400 text-sm">{index + 1}</td>
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200 uppercase shrink-0">
                          {team.name.substring(0, 2)}
                        </div>
                        <span className="font-bold text-slate-900 uppercase text-xs">{team.name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-center font-bold text-slate-600 text-xs">{team.played}</td>
                    <td className="py-4 text-center font-bold text-emerald-600 text-xs">{team.won}</td>
                    <td className="py-4 text-center font-bold text-red-600 text-xs">{team.lost}</td>
                    <td className="py-4 text-center font-bold text-blue-600 text-xs">{team.drawn}</td>
                    <td className="py-4 text-center font-bold text-slate-600 text-xs">{team.diff > 0 ? `+${team.diff}` : team.diff}</td>
                    <td className="py-4 text-center font-black text-emerald-600">{team.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'bracket' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
              <GitGraph className="w-5 h-5 text-purple-600" />
              Tournament Bracket
            </h2>
          </div>

          <div className="flex items-center justify-center p-12 text-center flex-col">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl relative">
                <div className="space-y-8">
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Semi Finals</div>
                   <div className="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl relative">
                      <div className="text-[9px] font-black text-slate-400 uppercase mb-2">Match #1</div>
                      <div className="font-bold text-slate-400 uppercase text-[11px]">To Be Determined</div>
                   </div>
                   <div className="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl relative">
                      <div className="text-[9px] font-black text-slate-400 uppercase mb-2">Match #2</div>
                      <div className="font-bold text-slate-400 uppercase text-[11px]">To Be Determined</div>
                   </div>
                </div>

                <div className="flex flex-col justify-center">
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Grand Final</div>
                   <div className="p-6 bg-indigo-50 border-4 border-indigo-200 rounded-[32px] relative shadow-xl">
                      <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-4" />
                      <div className="font-black text-indigo-900 uppercase text-sm">CHAMPIONSHIP</div>
                   </div>
                </div>

                <div className="space-y-8">
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Final Standing</div>
                   <div className="p-8 border-2 border-slate-100 border-dashed rounded-2xl flex items-center justify-center">
                      <span className="text-slate-300 font-black uppercase text-[10px]">Pending Matches</span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {matchToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-2xl font-black uppercase tracking-tight">Delete Match?</h3>
            </div>
            <p className="text-slate-500 font-medium mb-8">This will permanently remove the match and all its raid history. Are you sure?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setMatchToDelete(null)} className="px-6 py-2 text-xs font-black uppercase text-slate-400 hover:text-slate-800 transition-colors">Cancel</button>
              <button onClick={confirmDeleteMatch} className="px-8 py-3 bg-red-600 text-white rounded-2xl text-xs font-black uppercase hover:bg-red-700 transition-all shadow-lg">Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
