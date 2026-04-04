import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, query, orderByChild, equalTo, get, remove } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Swords, Plus, ArrowLeft, Shield, Trash2, AlertTriangle, Calendar, Timer } from 'lucide-react';

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
          setTournament({ id: docSnap.key, ...docSnap.val() });
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{tournament.name}</h1>
          <p className="text-slate-500 mt-1">Manage teams and matches for this tournament.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Teams Section */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Teams ({teams.length})
            </h2>
            <button
              onClick={() => setIsCreatingTeam(true)}
              className="p-2 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {isCreatingTeam && (
            <form onSubmit={handleCreateTeam} className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team Name *</label>
                  <input
                    type="text"
                    required
                    value={newTeam.name}
                    onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Bengal Warriors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Short Name</label>
                  <input
                    type="text"
                    value={newTeam.shortName}
                    onChange={(e) => setNewTeam({ ...newTeam, shortName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., BEN"
                    maxLength={10}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingTeam(false)}
                    className="px-3 py-1.5 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    Add Team
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {teams.length === 0 && !isCreatingTeam && (
              <p className="text-slate-500 text-center py-4">No teams added yet.</p>
            )}
            {teams.map(team => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold overflow-hidden border border-indigo-200 shrink-0">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" />
                    ) : (
                      team.shortName || team.name.substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="font-semibold text-slate-900">{team.name}</span>
                </div>
                <Users className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
              </Link>
            ))}
          </div>
        </div>

        {/* Matches Section */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Swords className="w-5 h-5 text-orange-600" />
              Matches ({matches.length})
            </h2>
            <button
              onClick={() => setIsCreatingMatch(true)}
              className="p-2 bg-orange-50 text-orange-600 rounded-md hover:bg-orange-100 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {isCreatingMatch && (
            <form onSubmit={handleCreateMatch} className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team A *</label>
                  <select
                    required
                    value={newMatch.teamAId}
                    onChange={(e) => setNewMatch({ ...newMatch, teamAId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team B *</label>
                  <select
                    required
                    value={newMatch.teamBId}
                    onChange={(e) => setNewMatch({ ...newMatch, teamBId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Match Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newMatch.matchDate}
                    onChange={(e) => setNewMatch({ ...newMatch, matchDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Match Duration (minutes) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="120"
                    value={newMatch.durationMinutes}
                    onChange={(e) => setNewMatch({ ...newMatch, durationMinutes: parseInt(e.target.value) || 45 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., 45"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingMatch(false)}
                    className="px-3 py-1.5 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm bg-orange-600 text-white font-medium rounded-md hover:bg-orange-700 transition-colors"
                  >
                    Create Match
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {matches.length === 0 && !isCreatingMatch && (
              <p className="text-slate-500 text-center py-4">No matches scheduled yet.</p>
            )}
            {matches.map(match => {
              const teamA = teams.find(t => t.id === match.teamAId);
              const teamB = teams.find(t => t.id === match.teamBId);
              
              return (
                <Link
                  key={match.id}
                  to={`/matches/${match.id}/score`}
                  className="block p-4 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      match.status === 'Completed' ? 'bg-slate-100 text-slate-600' :
                      match.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {match.status}
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/led/${match.id}`}
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 rounded-md transition-colors"
                        title="Open LED Display"
                      >
                        <Timer className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMatchToDelete(match.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete Match"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 mb-4 text-xs font-medium text-slate-500">
                    {match.matchDate && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(match.matchDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5" />
                      {(match as any).initialTimerSeconds ? Math.floor((match as any).initialTimerSeconds / 60) : 45} mins
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1 flex flex-col items-end">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-slate-900">{match.teamAName}</span>
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                          {teamA?.logoUrl ? (
                            <img src={teamA.logoUrl} alt={match.teamAName} className="w-full h-full object-cover" />
                          ) : (
                            <Shield className="w-4 h-4 text-indigo-300" />
                          )}
                        </div>
                      </div>
                      <div className="text-3xl font-black text-indigo-600">{match.teamAScore || 0}</div>
                    </div>
                    
                    <div className="px-6 text-slate-400 font-bold text-lg">VS</div>
                    
                    <div className="flex-1 flex flex-col items-start">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                          {teamB?.logoUrl ? (
                            <img src={teamB.logoUrl} alt={match.teamBName} className="w-full h-full object-cover" />
                          ) : (
                            <Shield className="w-4 h-4 text-orange-300" />
                          )}
                        </div>
                        <span className="font-bold text-slate-900">{match.teamBName}</span>
                      </div>
                      <div className="text-3xl font-black text-orange-600">{match.teamBScore || 0}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Delete Match Confirmation Modal */}
      {matchToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900">Delete Match</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete this match? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setMatchToDelete(null)}
                className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteMatch}
                className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 transition-colors"
              >
                Delete Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
