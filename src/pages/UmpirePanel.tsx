import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, query, orderByChild, equalTo, push, set, get, child } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { RotateCcw, Check, AlertCircle, ChevronRight, LayoutDashboard, Minus, Plus, ArrowRightLeft, Volume2, VolumeX, Shield, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const WHISTLE_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
const BUZZER_URL = 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3';

export const UmpirePanel: React.FC = () => {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<any>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  
  const whistleRef = useRef<HTMLAudioElement | null>(null);
  const buzzerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    whistleRef.current = new Audio(WHISTLE_URL);
    buzzerRef.current = new Audio(BUZZER_URL);
  }, []);

  const playSound = (type: 'whistle' | 'buzzer') => {
    if (!soundEnabled) return;
    if (type === 'whistle' && whistleRef.current) {
      whistleRef.current.currentTime = 0;
      whistleRef.current.play().catch(e => console.error("Audio play failed", e));
    } else if (type === 'buzzer' && buzzerRef.current) {
      buzzerRef.current.currentTime = 0;
      buzzerRef.current.play().catch(e => console.error("Audio play failed", e));
    }
  };
  
  const [raidingTeam, setRaidingTeam] = useState<'A' | 'B' | null>(null);
  
  const serverOffsetRef = useRef<number>(0);

  // Sync with server time offset
  useEffect(() => {
    const offsetRef = ref(db, ".info/serverTimeOffset");
    const unsub = onValue(offsetRef, (snap) => {
      serverOffsetRef.current = snap.val() || 0;
    });
    return () => unsub();
  }, []);

  const getServerTime = () => Date.now() + serverOffsetRef.current;

  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({
    teamAName: '',
    teamBName: '',
    matchDate: new Date().toISOString().slice(0, 16)
  });

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const matchesRef = ref(db, 'matches');
    const newMatchRef = push(matchesRef);
    
    await set(ref(db, `matches/${newMatchRef.key}`), {
      ...newMatch,
      status: 'Scheduled',
      teamAScore: 0,
      teamBScore: 0,
      createdAt: new Date().toISOString(),
      ownerId: user.uid
    });
    
    setIsCreatingMatch(false);
    setSelectedMatchId(newMatchRef.key);
  };

  // Fetch all user's matches
  useEffect(() => {
    if (!user) return;
    const matchesRef = query(ref(db, 'matches'), orderByChild('ownerId'), equalTo(user.uid));
    const unsub = onValue(matchesRef, (snapshot) => {
      const m: any[] = [];
      snapshot.forEach(child => {
        const val = child.val();
        // Strict client-side filter to ensure only matches owned by this user are shown
        if (val.ownerId === user.uid) {
          m.push({ id: child.key, ...val });
        }
      });
      // Sort by matchDate or createdAt
      m.sort((a, b) => {
        const dateA = new Date(a.matchDate || a.createdAt).getTime();
        const dateB = new Date(b.matchDate || b.createdAt).getTime();
        return dateB - dateA;
      });
      setMatches(m);
    });
    return () => unsub();
  }, [user]);

  // Listen to selected match
  useEffect(() => {
    if (!selectedMatchId) {
      setMatch(null);
      return;
    }

    const matchRef = ref(db, `matches/${selectedMatchId}`);
    const unsub = onValue(matchRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        // Safety check: Ensure the current user owns this match
        if (data.ownerId !== user.uid) {
          console.warn("Unauthorized access attempt to match:", selectedMatchId);
          setSelectedMatchId(null);
          return;
        }

        setMatch({ id: snapshot.key, ...data });
        
        // Sync raiding team
        setRaidingTeam(data.raidingTeam || null);

        // Sync sound enabled state with tournament setting if match belongs to a tournament
        if (data.tournamentId) {
          const tournamentRef = ref(db, `tournaments/${data.tournamentId}/audioEnabled`);
          onValue(tournamentRef, (snap) => {
            if (snap.exists()) {
              setSoundEnabled(snap.val());
            }
          }, { onlyOnce: true });
        }
      }
    });

    return () => unsub();
  }, [selectedMatchId]);

  const selectRaidingTeam = async (team: 'A' | 'B' | null) => {
    if (!selectedMatchId) return;
    setRaidingTeam(team);
    await update(ref(db, `matches/${selectedMatchId}`), {
      raidingTeam: team
    });
  };

  const toggleRaidingTeam = async () => {
    if (!selectedMatchId) return;
    let nextTeam: 'A' | 'B' | null = null;
    if (!raidingTeam) nextTeam = 'A';
    else if (raidingTeam === 'A') nextTeam = 'B';
    else if (raidingTeam === 'B') nextTeam = 'A';
    
    setRaidingTeam(nextTeam);
    await update(ref(db, `matches/${selectedMatchId}`), {
      raidingTeam: nextTeam
    });
  };

  const updateMatchStatus = async (status: string) => {
    if (!selectedMatchId || !match) return;
    
    const updates: any = { status };
    
    await update(ref(db, `matches/${selectedMatchId}`), updates);
  };

  const adjustScore = async (team: 'A' | 'B', delta: number) => {
    if (!selectedMatchId || !match || !user) return;
    const currentScore = team === 'A' ? (match.teamAScore || 0) : (match.teamBScore || 0);
    const newScore = Math.max(0, currentScore + delta);
    
    try {
      // Update actual score
      await update(ref(db, `matches/${selectedMatchId}`), {
        [team === 'A' ? 'teamAScore' : 'teamBScore']: newScore,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating score:", error);
    }
  };

  if (!selectedMatchId) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Umpire Panel</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreatingMatch(true)}
              className="text-sm font-bold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Match
            </button>
            <Link to="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </Link>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
              title={soundEnabled ? "Sound Enabled" : "Sound Muted"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isCreatingMatch && (
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-xl overflow-hidden mb-6 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Create New Match</h2>
            <form onSubmit={handleCreateMatch} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Team A Name</label>
                  <input
                    required
                    type="text"
                    value={newMatch.teamAName}
                    onChange={(e) => setNewMatch({...newMatch, teamAName: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Team B Name</label>
                  <input
                    required
                    type="text"
                    value={newMatch.teamBName}
                    onChange={(e) => setNewMatch({...newMatch, teamBName: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    value={newMatch.matchDate}
                    onChange={(e) => setNewMatch({...newMatch, matchDate: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingMatch(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                >
                  Create & Start
                </button>
              </div>
            </form>
          </div>
        )}
        
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-800">Select Match to Officiate</h2>
            <p className="text-sm text-slate-500">Only matches you've created are shown here.</p>
          </div>
          
          <div className="divide-y divide-slate-100">
            {matches.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No matches found. Create a match first.</p>
              </div>
            ) : (
              matches.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMatchId(m.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-indigo-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                      VS
                    </div>
                    <div>
                      {m.tournamentName && (
                        <div className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter mb-0.5">
                          {m.tournamentName}
                        </div>
                      )}
                      <div className="font-bold text-slate-900">
                        {m.teamAName} vs {m.teamBName}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded-full ${
                          m.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {m.status}
                        </span>
                        {m.matchDate && <span>• {new Date(m.matchDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!match) return <div className="p-8 text-center">Loading match data...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 relative">
      {/* Choose First Raiding Team Overlay */}
      {!raidingTeam && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border-4 border-indigo-600">
            <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">First Raiding Team</h2>
            <p className="text-slate-500 mb-8 font-medium">Who won the toss? Select the team that will start raiding.</p>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => selectRaidingTeam('A')}
                className="group relative flex flex-col items-center gap-4 p-6 rounded-2xl bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-600 transition-all hover:shadow-xl active:scale-95"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-2xl font-black shadow-lg group-hover:scale-110 transition-transform">
                  A
                </div>
                <span className="font-bold text-slate-800 uppercase tracking-wider text-sm truncate w-full">
                  {match.teamAName}
                </span>
                <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  SELECT
                </div>
              </button>

              <button
                onClick={() => selectRaidingTeam('B')}
                className="group relative flex flex-col items-center gap-4 p-6 rounded-2xl bg-orange-50 border-2 border-orange-100 hover:border-orange-600 transition-all hover:shadow-xl active:scale-95"
              >
                <div className="w-16 h-16 rounded-full bg-orange-600 text-white flex items-center justify-center text-2xl font-black shadow-lg group-hover:scale-110 transition-transform">
                  B
                </div>
                <span className="font-bold text-slate-800 uppercase tracking-wider text-sm truncate w-full">
                  {match.teamBName}
                </span>
                <div className="absolute -top-2 -right-2 bg-orange-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  SELECT
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        {match.tournamentName && (
          <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[8px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest shadow-lg">
            {match.tournamentName}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedMatchId(null)}
            className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-4 h-4" /> Change Match
          </button>
          <div className="flex items-center gap-4">
            <select
              value={match.status || 'Scheduled'}
              onChange={(e) => updateMatchStatus(e.target.value)}
              className="text-sm font-bold px-4 py-1.5 bg-slate-100 border border-slate-200 rounded-full text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="Scheduled">Scheduled</option>
              <option value="First Half">First Half</option>
              <option value="Halftime">Halftime</option>
              <option value="Second Half">Second Half</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Broadcast Links:</span>
          <Link 
            to={`/obs/${selectedMatchId}`} 
            target="_blank"
            className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full hover:bg-indigo-600 hover:text-white transition-all uppercase"
          >
            OBS Overlay
          </Link>
          <Link 
            to={`/led/${selectedMatchId}`} 
            target="_blank"
            className="text-[10px] font-bold bg-orange-50 text-orange-600 px-3 py-1 rounded-full hover:bg-orange-600 hover:text-white transition-all uppercase"
          >
            LED Display
          </Link>
        </div>
      </div>

      {/* Two Column Layout for Scoring */}
      <div className="grid grid-cols-2 gap-4 relative">
        {/* Raiding Team Switch Toggle */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">Select Raiding Team</span>
          <div className="flex items-center bg-slate-100 rounded-full p-1 border border-slate-200 shadow-lg">
            <button
              onClick={() => selectRaidingTeam('A')}
              className={`px-6 py-2 rounded-full text-[11px] font-black transition-all duration-300 ${
                raidingTeam === 'A' ? 'bg-indigo-600 text-white shadow-md scale-105' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              TEAM A
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button
              onClick={() => selectRaidingTeam('B')}
              className={`px-6 py-2 rounded-full text-[11px] font-black transition-all duration-300 ${
                raidingTeam === 'B' ? 'bg-orange-600 text-white shadow-md scale-105' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              TEAM B
            </button>
          </div>
        </div>

        <button 
          onClick={toggleRaidingTeam}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg border-4 border-white flex items-center justify-center active:scale-90 transition-all hover:bg-indigo-700"
        >
          <ArrowRightLeft className="w-6 h-6" />
        </button>

        {/* Team A Box */}
        <div className={`p-8 rounded-2xl border transition-all flex flex-col items-center justify-center ${
          raidingTeam === 'A' ? 'bg-indigo-50 border-indigo-600 ring-4 ring-indigo-200 shadow-2xl scale-[1.02]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex flex-col items-center w-full mb-6">
            <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm mb-2 text-center">{match.teamAName}</h3>
            <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border transition-all ${
              raidingTeam === 'A' 
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg animate-pulse' 
                : 'bg-slate-50 border-slate-200 text-slate-300'
            }`}>
              {raidingTeam === 'A' ? 'CURRENTLY RAIDING' : 'WAITING'}
            </div>
          </div>
          <div className="text-[10rem] font-black text-indigo-600 leading-none mb-8 tabular-nums drop-shadow-sm">{match.teamAScore || 0}</div>
          <div className="flex gap-4 justify-center w-full">
            <button
              onClick={() => adjustScore('A', -1)}
              className="w-16 h-16 bg-white text-slate-400 rounded-2xl flex items-center justify-center border-2 border-slate-100 hover:border-slate-300 hover:text-slate-600 transition-all active:scale-90 shadow-sm"
            >
              <Minus className="w-8 h-8" />
            </button>
            <button
              onClick={() => adjustScore('A', 1)}
              className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-90"
            >
              <Plus className="w-8 h-8" />
            </button>
          </div>
        </div>

        {/* Team B Box */}
        <div className={`p-8 rounded-2xl border transition-all flex flex-col items-center justify-center ${
          raidingTeam === 'B' ? 'bg-orange-50 border-orange-600 ring-4 ring-orange-200 shadow-2xl scale-[1.02]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex flex-col items-center w-full mb-6">
            <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm mb-2 text-center">{match.teamBName}</h3>
            <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border transition-all ${
              raidingTeam === 'B' 
                ? 'bg-orange-600 border-orange-600 text-white shadow-lg animate-pulse' 
                : 'bg-slate-50 border-slate-200 text-slate-300'
            }`}>
              {raidingTeam === 'B' ? 'CURRENTLY RAIDING' : 'WAITING'}
            </div>
          </div>
          <div className="text-[10rem] font-black text-orange-600 leading-none mb-8 tabular-nums drop-shadow-sm">{match.teamBScore || 0}</div>
          <div className="flex gap-4 justify-center w-full">
            <button
              onClick={() => adjustScore('B', -1)}
              className="w-16 h-16 bg-white text-slate-400 rounded-2xl flex items-center justify-center border-2 border-slate-100 hover:border-slate-300 hover:text-slate-600 transition-all active:scale-90 shadow-sm"
            >
              <Minus className="w-8 h-8" />
            </button>
            <button
              onClick={() => adjustScore('B', 1)}
              className="w-16 h-16 bg-orange-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-orange-200 hover:bg-orange-700 transition-all active:scale-90"
            >
              <Plus className="w-8 h-8" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
