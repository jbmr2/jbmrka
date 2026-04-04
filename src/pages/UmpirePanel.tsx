import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, query, orderByChild, equalTo, push, set } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Play, Pause, RotateCcw, Timer, Check, AlertCircle, ChevronRight, LayoutDashboard, Minus, Plus, ArrowRightLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const UmpirePanel: React.FC = () => {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<any>(null);
  
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [raidTimer, setRaidTimer] = useState(30);
  const [isRaidTimerRunning, setIsRaidTimerRunning] = useState(false);
  const [raidingTeam, setRaidingTeam] = useState<'A' | 'B' | null>(null);
  
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const raidIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
    matchDate: new Date().toISOString().slice(0, 16),
    durationMinutes: 40
  });

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const matchesRef = ref(db, 'matches');
    const newMatchRef = push(matchesRef);
    const initialSeconds = Math.floor(newMatch.durationMinutes * 60 / 2); // Default to half duration for kabaddi
    
    await set(ref(db, `matches/${newMatchRef.key}`), {
      ...newMatch,
      status: 'Scheduled',
      teamAScore: 0,
      teamBScore: 0,
      initialTimerSeconds: initialSeconds,
      timerSeconds: initialSeconds,
      isTimerRunning: false,
      raidTimerSeconds: 30,
      isRaidTimerRunning: false,
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
        m.push({ id: child.key, ...child.val() });
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
        setMatch({ id: snapshot.key, ...data });
        
        // Sync timers if they aren't running locally (initial load or remote change)
        if (!isTimerRunning) {
          let currentSeconds = data.timerSeconds !== undefined ? data.timerSeconds : (data.initialTimerSeconds || 2700);
          if (data.isTimerRunning && data.timerUpdatedAt) {
            const elapsed = Math.floor((getServerTime() - data.timerUpdatedAt) / 1000);
            currentSeconds = Math.max(0, currentSeconds - elapsed);
          }
          setTimerSeconds(currentSeconds);
          setIsTimerRunning(data.isTimerRunning || false);
        }

        if (!isRaidTimerRunning) {
          let currentRaidSeconds = data.raidTimerSeconds !== undefined ? data.raidTimerSeconds : 30;
          if (data.isRaidTimerRunning && data.raidTimerUpdatedAt) {
            const elapsed = Math.floor((getServerTime() - data.raidTimerUpdatedAt) / 1000);
            currentRaidSeconds = Math.max(0, currentRaidSeconds - elapsed);
          }
          setRaidTimer(currentRaidSeconds);
          setIsRaidTimerRunning(data.isRaidTimerRunning || false);
        }

        // Sync raiding team
        setRaidingTeam(data.raidingTeam || null);
      }
    });

    return () => unsub();
  }, [selectedMatchId]);

  // Match Timer Logic
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            stopMatchTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isTimerRunning]);

  // Raid Timer Logic
  useEffect(() => {
    if (isRaidTimerRunning) {
      raidIntervalRef.current = setInterval(() => {
        setRaidTimer(prev => {
          if (prev <= 1) {
            stopRaidTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (raidIntervalRef.current) {
      clearInterval(raidIntervalRef.current);
    }
    return () => { if (raidIntervalRef.current) clearInterval(raidIntervalRef.current); };
  }, [isRaidTimerRunning]);

  // Sync Match Timer to DB every 5s
  useEffect(() => {
    if (!selectedMatchId || !isTimerRunning) return;
    const interval = setInterval(() => {
      update(ref(db, `matches/${selectedMatchId}`), {
        timerSeconds,
        timerUpdatedAt: getServerTime(),
        isTimerRunning: true
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedMatchId, isTimerRunning, timerSeconds]);

  const toggleMatchTimer = async () => {
    if (!selectedMatchId || !match) return;
    const newState = !isTimerRunning;
    setIsTimerRunning(newState);
    
    await update(ref(db, `matches/${selectedMatchId}`), {
      isTimerRunning: newState,
      timerSeconds,
      timerUpdatedAt: getServerTime(),
      status: match.status === 'Scheduled' ? 'First Half' : match.status
    });
  };

  const stopMatchTimer = async () => {
    if (!selectedMatchId) return;
    setIsTimerRunning(false);
    await update(ref(db, `matches/${selectedMatchId}`), {
      isTimerRunning: false,
      timerSeconds: 0,
      timerUpdatedAt: getServerTime()
    });
  };

  const toggleRaidTimer = async () => {
    if (!selectedMatchId || !match) return;
    const newState = !isRaidTimerRunning;
    
    // If starting a new raid, reset clock to 30
    if (newState && raidTimer === 0) {
      setRaidTimer(30);
    }

    setIsRaidTimerRunning(newState);
    
    await update(ref(db, `matches/${selectedMatchId}`), {
      isRaidTimerRunning: newState,
      raidTimerSeconds: (newState && raidTimer === 0) ? 30 : raidTimer,
      raidTimerUpdatedAt: getServerTime()
    });
  };

  const resetRaidTimer = async () => {
    if (!selectedMatchId) return;
    setRaidTimer(30);
    await update(ref(db, `matches/${selectedMatchId}`), {
      raidTimerSeconds: 30,
      raidTimerUpdatedAt: getServerTime(),
      isRaidTimerRunning: isRaidTimerRunning
    });
  };

  const stopRaidTimer = async () => {
    if (!selectedMatchId) return;
    setIsRaidTimerRunning(false);
    
    // Auto-switch raiding team for the next raid
    let nextTeam: 'A' | 'B' | null = null;
    if (raidingTeam === 'A') nextTeam = 'B';
    else if (raidingTeam === 'B') nextTeam = 'A';
    else nextTeam = null; // If none selected, stay none
    
    setRaidingTeam(nextTeam);
    setRaidTimer(30);
    
    await update(ref(db, `matches/${selectedMatchId}`), {
      isRaidTimerRunning: false,
      raidTimerSeconds: 30,
      raidTimerUpdatedAt: getServerTime(),
      raidingTeam: nextTeam
    });
  };

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
    
    // Reset timer when switching to certain statuses
    if (status === 'First Half' || status === 'Second Half') {
      const initialSeconds = match.initialTimerSeconds || (match.durationMinutes ? match.durationMinutes * 60 : 1200);
      updates.timerSeconds = initialSeconds;
      updates.timerUpdatedAt = getServerTime();
      updates.isTimerRunning = false;
      setTimerSeconds(initialSeconds);
      setIsTimerRunning(false);
    }
    
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duration (min)</label>
                  <input
                    required
                    type="number"
                    value={newMatch.durationMinutes}
                    onChange={(e) => setNewMatch({...newMatch, durationMinutes: parseInt(e.target.value)})}
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
      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
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

      {/* Two Column Layout for Scoring and Clocks */}
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
        <div className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-between ${
          raidingTeam === 'A' ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-200' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex justify-between items-start w-full mb-2">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] truncate max-w-[60%]">{match.teamAName}</h3>
            <button
              onClick={() => selectRaidingTeam(raidingTeam === 'A' ? null : 'A')}
              className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border transition-all ${
                raidingTeam === 'A' 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-indigo-50'
              }`}
            >
              {raidingTeam === 'A' ? 'Raiding' : 'Raid'}
            </button>
          </div>
          <div className="text-5xl font-black text-indigo-600 mb-4">{match.teamAScore || 0}</div>
          {isRaidTimerRunning && (
            <div className="flex gap-3 justify-center w-full animate-in fade-in zoom-in duration-300">
              <button
                onClick={() => adjustScore('A', -1)}
                className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center border border-slate-200 transition-all active:scale-95"
              >
                <Minus className="w-6 h-6" />
              </button>
              <button
                onClick={() => adjustScore('A', 1)}
                className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-200 transition-all active:scale-95"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>

        {/* Team B Box */}
        <div className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-between ${
          raidingTeam === 'B' ? 'bg-orange-50 border-orange-600 ring-2 ring-orange-200' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex justify-between items-start w-full mb-2">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] truncate max-w-[60%]">{match.teamBName}</h3>
            <button
              onClick={() => selectRaidingTeam(raidingTeam === 'B' ? null : 'B')}
              className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border transition-all ${
                raidingTeam === 'B' 
                  ? 'bg-orange-600 border-orange-600 text-white shadow-sm' 
                  : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-orange-50'
              }`}
            >
              {raidingTeam === 'B' ? 'Raiding' : 'Raid'}
            </button>
          </div>
          <div className="text-5xl font-black text-orange-600 mb-4">{match.teamBScore || 0}</div>
          {isRaidTimerRunning && (
            <div className="flex gap-3 justify-center w-full animate-in fade-in zoom-in duration-300">
              <button
                onClick={() => adjustScore('B', -1)}
                className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center border border-slate-200 transition-all active:scale-95"
              >
                <Minus className="w-6 h-6" />
              </button>
              <button
                onClick={() => adjustScore('B', 1)}
                className="w-12 h-12 bg-orange-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-orange-200 transition-all active:scale-95"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>

        {/* Match Clock Box */}
        <div className="bg-slate-900 p-4 rounded-2xl text-white shadow-xl flex flex-col items-center justify-between">
          <div className="flex items-center gap-1.5 text-indigo-400 mb-2">
            <Timer className="w-4 h-4" />
            <span className="font-bold uppercase tracking-wider text-[10px]">Match</span>
          </div>
          <div className="text-4xl font-mono font-black mb-4 tabular-nums tracking-tighter">
            {formatTime(timerSeconds)}
          </div>
          <div className="flex gap-2 w-full">
            {match.status === 'Halftime' || (timerSeconds === 0 && match.status === 'First Half') ? (
              <button
                onClick={async () => {
                  const initial = match.initialTimerSeconds || 2700;
                  setTimerSeconds(initial);
                  setIsTimerRunning(false);
                  await update(ref(db, `matches/${selectedMatchId}`), {
                    status: 'Second Half',
                    timerSeconds: initial,
                    timerUpdatedAt: getServerTime(),
                    isTimerRunning: false
                  });
                }}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] animate-pulse"
              >
                Start 2nd Half
              </button>
            ) : (
              <button
                onClick={toggleMatchTimer}
                className={`flex-1 flex items-center justify-center py-2.5 rounded-xl font-bold uppercase text-[10px] transition-all ${
                  isTimerRunning ? 'bg-orange-600' : 'bg-indigo-600'
                }`}
              >
                {isTimerRunning ? <Pause className="w-3 h-3 fill-white" /> : <Play className="w-3 h-3 fill-white" />}
              </button>
            )}
            <button
              onClick={stopMatchTimer}
              className="px-3 bg-slate-800 text-slate-300 rounded-xl font-bold uppercase text-[10px]"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Raid Clock Box */}
        <div className="bg-slate-900 p-4 rounded-2xl text-white shadow-xl flex flex-col items-center justify-between">
          <div className="flex items-center justify-between w-full mb-2">
            <div className="flex items-center gap-1.5 text-orange-400">
              <Timer className="w-4 h-4" />
              <span className="font-bold uppercase tracking-wider text-[10px]">Raid</span>
            </div>
            <button 
              onClick={toggleRaidingTeam}
              className="p-1 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-white"
              title="Switch Raiding Team"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className={`text-4xl font-mono font-black mb-4 tabular-nums tracking-tighter ${raidTimer <= 5 ? 'text-red-500 animate-pulse' : ''}`}>
            {raidTimer}
          </div>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => toggleRaidTimer()}
              className={`flex-1 flex items-center justify-center py-2.5 rounded-xl font-bold uppercase text-[10px] transition-all ${
                isRaidTimerRunning ? 'bg-orange-600' : 'bg-emerald-600'
              }`}
            >
              {isRaidTimerRunning ? <Pause className="w-3 h-3 fill-white" /> : <Play className="w-3 h-3 fill-white" />}
            </button>
            <button
              onClick={stopRaidTimer}
              className="px-3 bg-red-600 text-white rounded-xl font-bold uppercase text-[8px] flex flex-col items-center justify-center leading-tight"
            >
              <span>FINISH</span>
              <span>RAID</span>
            </button>
            <button
              onClick={resetRaidTimer}
              className="px-3 bg-slate-800 text-slate-300 rounded-xl font-bold uppercase text-[10px]"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
