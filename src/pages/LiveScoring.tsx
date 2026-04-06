import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, query, orderByChild, equalTo, get, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Activity, History, Minus, Plus, RotateCcw, Users, Edit2, Check, ArrowRightLeft } from 'lucide-react';
import { SubstitutionModal } from '../components/SubstitutionModal';

export const LiveScoring: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [match, setMatch] = useState<any>(null);
  const [raids, setRaids] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [currentHalf, setCurrentHalf] = useState('First Half');
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingRaidId, setEditingRaidId] = useState<string | null>(null);
  
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

  const handleEditRaid = (raid: any) => {
    setEditingRaidId(raid.id);
  };

  useEffect(() => {
    if (!id || !user) return;

    // Listen to match
    const matchRef = ref(db, `matches/${id}`);
    const unsubMatch = onValue(matchRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setMatch({ id: snapshot.key, ...data });
        
        if (data.status === 'Second Half') setCurrentHalf('Second Half');
        else if (data.status === 'First Half') setCurrentHalf('First Half');
      } else {
        navigate('/');
      }
    }, (error) => console.error("Error fetching match:", error));

    // Listen to raids
    const raidsQ = query(ref(db, `matches/${id}/raids`));
    const unsubRaids = onValue(raidsQ, (snapshot) => {
      const r: any[] = [];
      snapshot.forEach(childSnapshot => {
        r.push({ id: childSnapshot.key, ...childSnapshot.val() });
      });
      r.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      setRaids(r);
    }, (error) => console.error("Error fetching raids:", error));

    return () => {
      unsubMatch();
      unsubRaids();
    };
  }, [id, user, navigate]);

  const matchId = match?.id;
  const teamAId = match?.teamAId;
  const teamBId = match?.teamBId;

  useEffect(() => {
    if (!matchId || !teamAId || !teamBId) return;
    const playersRef = ref(db, 'players');
    const unsub = onValue(playersRef, (snapshot) => {
      const p: any[] = [];
      snapshot.forEach(child => {
        const val = child.val();
        if (val.teamId === teamAId || val.teamId === teamBId) {
          p.push({ id: child.key, ...val });
        }
      });
      setPlayers(p);
    });
    return () => unsub();
  }, [matchId, teamAId, teamBId]);

  const adjustScore = async (team: 'A' | 'B', delta: number) => {
    if (!match || !id || !user) return;
    const currentScore = team === 'A' ? (match.teamAScore || 0) : (match.teamBScore || 0);
    const newScore = Math.max(0, currentScore + delta);
    
    try {
      // 1. Add a record to the raids collection so this can be undone
      const activityData: any = {
        matchId: id,
        attackingTeamId: team === 'A' ? match.teamAId : match.teamBId,
        defendingTeamId: team === 'A' ? match.teamBId : match.teamAId,
        raiderId: 'manual', // Indicates manual adjustment
        outDefenderIds: [],
        raidResult: delta > 0 ? 'Manual Addition' : 'Manual Deduction',
        touchPoints: 0,
        bonusPoints: 0,
        tacklePoints: 0,
        allOutPoints: 0,
        extraPoints: delta,
        totalPointsScored: delta,
        half: currentHalf,
        timestamp: new Date().toISOString(),
        ownerId: user.uid,
        previousTeamAScore: match.teamAScore || 0,
        previousTeamBScore: match.teamBScore || 0,
        previousLineup: match.lineup || null,
        scoringTeamId: team === 'A' ? match.teamAId : match.teamBId
      };
      
      const newActivityRef = push(ref(db, `matches/${id}/raids`));
      await set(newActivityRef, activityData);

      // 2. Update the actual score
      await update(ref(db, `matches/${id}`), {
        [team === 'A' ? 'teamAScore' : 'teamBScore']: newScore,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating score:", error);
    }
  };

  const updateMatchStatus = async (newStatus: string) => {
    if (!match || !id) return;
    try {
      const updates: any = { status: newStatus, updatedAt: new Date().toISOString() };
      await update(ref(db, `matches/${id}`), updates);
    } catch (error) {
      console.error("Error updating match status:", error);
    }
  };

  const saveLineup = async (lineup: any) => {
    if (!id) return;
    try {
      await update(ref(db, `matches/${id}`), { lineup });
    } catch (error) {
      console.error("Error saving lineup:", error);
    }
  };

  const recordRaid = async (attackingTeamId: string, defendingTeamId: string, result: string, points: any, raiderId: string, outDefenderIds: string[] = [], selfOutIds: string[] = []) => {
    if (!match || !user || !id) return;

    const { touch = 0, bonus = 0, tackle = 0, technical = 0, allOut = 0, extra = 0 } = points;
    
    // Calculate who gets points
    let teamAScoreAdd = 0;
    let teamBScoreAdd = 0;

    if (attackingTeamId === match.teamAId) {
      teamAScoreAdd += touch + bonus;
      teamBScoreAdd += tackle;
    } else {
      teamBScoreAdd += touch + bonus;
      teamAScoreAdd += tackle;
    }

    // Technical points belong to the scoring team
    if (technical > 0 && points.scoringTeamId) {
      if (points.scoringTeamId === match.teamAId) teamAScoreAdd += technical;
      else if (points.scoringTeamId === match.teamBId) teamBScoreAdd += technical;
    }

    // Self Out points go to the opponent team
    if (selfOutIds && selfOutIds.length > 0) {
      selfOutIds.forEach(pid => {
        const player = players.find(p => p.id === pid);
        if (player) {
          if (player.teamId === match.teamAId) teamBScoreAdd += 1;
          else teamAScoreAdd += 1;
        }
      });
    }

    // All out points go to the team that inflicted it
    if (allOut > 0) {
      if (points.scoringTeamId === match.teamAId) teamAScoreAdd += allOut;
      if (points.scoringTeamId === match.teamBId) teamBScoreAdd += allOut;
    }
    
    if (extra > 0) {
      if (points.scoringTeamId === match.teamAId) teamAScoreAdd += extra;
      if (points.scoringTeamId === match.teamBId) teamBScoreAdd += extra;
    }

    const totalPointsScored = touch + bonus + tackle + allOut + extra + technical;

    let newLineup = match.lineup ? JSON.parse(JSON.stringify(match.lineup)) : null;
    
    if (newLineup) {
      const attTeamKey = attackingTeamId === match.teamAId ? 'teamA' : 'teamB';
      const defTeamKey = defendingTeamId === match.teamAId ? 'teamA' : 'teamB';
      
      if (!newLineup[attTeamKey].out) newLineup[attTeamKey].out = [];
      if (!newLineup[defTeamKey].out) newLineup[defTeamKey].out = [];
      if (!newLineup[attTeamKey].onMat) newLineup[attTeamKey].onMat = [];
      if (!newLineup[defTeamKey].onMat) newLineup[defTeamKey].onMat = [];

      let revivedCount = 0;

      // Self Out handling
      if (selfOutIds && selfOutIds.length > 0) {
        selfOutIds.forEach(pid => {
          const player = players.find(p => p.id === pid);
          if (player) {
            const teamKey = player.teamId === match.teamAId ? 'teamA' : 'teamB';
            const oppTeamKey = player.teamId === match.teamAId ? 'teamB' : 'teamA';
            
            if (newLineup[teamKey].onMat.includes(pid)) {
              newLineup[teamKey].onMat = newLineup[teamKey].onMat.filter((id: string) => id !== pid);
              newLineup[teamKey].out.push(pid);
              
              // Opposition gets revival
              if (newLineup[oppTeamKey].out.length > 0) {
                const revivedId = newLineup[oppTeamKey].out.shift();
                newLineup[oppTeamKey].onMat.push(revivedId);
              }
            }
          }
        });
      }

      if (result === 'Unsuccessful' && raiderId) {
        // Raider is out
        newLineup[attTeamKey].onMat = newLineup[attTeamKey].onMat.filter((pid: string) => pid !== raiderId);
        newLineup[attTeamKey].out.push(raiderId);
        // Defending team gets 1 revival
        if (newLineup[defTeamKey].out.length > 0) {
          const revivedId = newLineup[defTeamKey].out.shift();
          newLineup[defTeamKey].onMat.push(revivedId);
        }
      } else if (result === 'Successful' || result === 'Super Raid') {
        // Defenders are out
        if (outDefenderIds.length > 0) {
          newLineup[defTeamKey].onMat = newLineup[defTeamKey].onMat.filter((pid: string) => !outDefenderIds.includes(pid));
          newLineup[defTeamKey].out.push(...outDefenderIds);
          revivedCount = outDefenderIds.length;
        }
        
        // Attacking team gets revivals
        for (let i = 0; i < revivedCount; i++) {
          if (newLineup[attTeamKey].out.length > 0) {
            const revivedId = newLineup[attTeamKey].out.shift();
            newLineup[attTeamKey].onMat.push(revivedId);
          }
        }
      }

      // Handle All Out
      if (allOut > 0) {
        const allOutTeamKey = points.scoringTeamId === match.teamAId ? 'teamB' : 'teamA';
        newLineup[allOutTeamKey].onMat = [...newLineup[allOutTeamKey].onMat, ...newLineup[allOutTeamKey].out];
        newLineup[allOutTeamKey].out = [];
      }
    }

    try {
      // Calculate current raid number (excluding manual adjustments and substitutions)
      const actualRaidsCount = raids.filter(r => r.raiderId !== 'manual' && r.raiderId !== 'substitution').length;
      const raidNumber = actualRaidsCount + 1;

      // 1. Add Raid Record
      const raidData: any = {
        matchId: id,
        raidNumber,
        attackingTeamId,
        defendingTeamId,
        raiderId,
        outDefenderIds,
        raidResult: result,
        touchPoints: touch,
        bonusPoints: bonus,
        tacklePoints: tackle,
        technicalPoints: technical,
        allOutPoints: allOut,
        extraPoints: extra,
        totalPointsScored,
        selfOutIds,
        half: currentHalf,
        timestamp: new Date().toISOString(),
        ownerId: user.uid,
        // Store previous state for undo functionality
        previousTeamAScore: match.teamAScore || 0,
        previousTeamBScore: match.teamBScore || 0,
        previousLineup: match.lineup || null
      };
      if (points.scoringTeamId) raidData.scoringTeamId = points.scoringTeamId;
      
      const newRaidRef = push(ref(db, `matches/${id}/raids`));
      await set(newRaidRef, raidData);

      // 2. Update Match Score and Lineup
      const matchUpdates: any = {
        updatedAt: new Date().toISOString()
      };
      
      if (teamAScoreAdd > 0 || teamBScoreAdd > 0) {
        matchUpdates.teamAScore = (match.teamAScore || 0) + teamAScoreAdd;
        matchUpdates.teamBScore = (match.teamBScore || 0) + teamBScoreAdd;
      }
      
      if (newLineup) {
        matchUpdates.lineup = newLineup;
      }

      await update(ref(db, `matches/${id}`), matchUpdates);
    } catch (error) {
      console.error("Error recording raid:", error);
    }
  };

  const undoLastRaid = async () => {
    if (!match || !id || raids.length === 0) return;
    
    // Get the last raid (raids array is sorted newest first, so index 0 is the latest)
    const lastRaid = raids[0];
    
    try {
      // 1. Delete the raid record
      await set(ref(db, `matches/${id}/raids/${lastRaid.id}`), null);
      
      // 2. Revert match state if previous state exists
      if (lastRaid.previousTeamAScore !== undefined && lastRaid.previousTeamBScore !== undefined) {
        const matchUpdates: any = {
          teamAScore: lastRaid.previousTeamAScore,
          teamBScore: lastRaid.previousTeamBScore,
          updatedAt: new Date().toISOString()
        };
        
        if (lastRaid.previousLineup) {
          matchUpdates.lineup = lastRaid.previousLineup;
        }
        
        await update(ref(db, `matches/${id}`), matchUpdates);
      } else {
        // Fallback if previous state wasn't stored (for older raids)
        console.warn("Cannot fully undo this raid because it was recorded before the undo feature was added.");
      }
    } catch (error) {
      console.error("Error undoing raid:", error);
    }
  };

  const recordSubstitution = async (teamId: string, playerOutId: string, playerInId: string) => {
    if (!match || !id || !user || !match.lineup) return;

    const teamKey = teamId === match.teamAId ? 'teamA' : 'teamB';
    const newLineup = JSON.parse(JSON.stringify(match.lineup));

    // Remove from onMat, add to bench
    newLineup[teamKey].onMat = newLineup[teamKey].onMat.filter((pid: string) => pid !== playerOutId);
    if (!newLineup[teamKey].bench) newLineup[teamKey].bench = [];
    newLineup[teamKey].bench.push(playerOutId);

    // Remove from bench, add to onMat
    newLineup[teamKey].bench = newLineup[teamKey].bench.filter((pid: string) => pid !== playerInId);
    newLineup[teamKey].onMat.push(playerInId);

    try {
      // 1. Add Activity Record
      const activityData: any = {
        matchId: id,
        attackingTeamId: teamId,
        defendingTeamId: teamId,
        raiderId: 'substitution',
        outDefenderIds: [playerOutId, playerInId], // Store who went out and in
        raidResult: 'Substitution',
        touchPoints: 0,
        bonusPoints: 0,
        tacklePoints: 0,
        allOutPoints: 0,
        extraPoints: 0,
        totalPointsScored: 0,
        half: currentHalf,
        timestamp: new Date().toISOString(),
        ownerId: user.uid,
        previousTeamAScore: match.teamAScore || 0,
        previousTeamBScore: match.teamBScore || 0,
        previousLineup: match.lineup
      };
      
      const newActivityRef = push(ref(db, `matches/${id}/raids`));
      await set(newActivityRef, activityData);

      // 2. Update Match Lineup
      await update(ref(db, `matches/${id}`), {
        lineup: newLineup,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error recording substitution:", error);
    }
  };

  if (!match) return <div className="flex justify-center p-8">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Link to={`/tournaments/${match.tournamentId}`} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Live Scoring</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to={`/obs/${id}`}
            target="_blank"
            className="text-sm font-bold px-4 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-full transition-colors flex items-center gap-1"
            title="Open OBS Overlay in new tab"
          >
            <Activity className="w-4 h-4" /> OBS Overlay
          </Link>
          <Link
            to={`/led/${id}`}
            target="_blank"
            className="text-sm font-bold px-4 py-1.5 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 rounded-full transition-colors flex items-center gap-1 shadow-sm border border-yellow-200"
            title="Open LED Ticker Display in new tab"
          >
            <Activity className="w-4 h-4" /> LED Display
          </Link>
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

      {/* Scoreboard */}
      <div className="bg-slate-900 rounded-2xl p-4 md:p-6 shadow-xl text-white relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full bg-indigo-500 blur-3xl"></div>
          <div className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full bg-orange-500 blur-3xl"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          {/* Status Display */}
          <div className="mb-4 flex flex-col items-center">
            <div className="px-6 py-2 bg-white/10 rounded-full border border-white/20 shadow-lg">
              <span className="text-2xl font-black text-white uppercase tracking-[0.3em]">{match.status || 'Scheduled'}</span>
            </div>
          </div>

          {/* Scores */}
          <div className="w-full flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex-1 text-center">
              <h2 className="text-xl md:text-2xl font-bold text-indigo-300 mb-1 truncate px-2">{match.teamAName}</h2>
              <div className="text-5xl md:text-6xl font-black text-white drop-shadow-2xl mb-3">{match.teamAScore || 0}</div>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => adjustScore('A', -1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors border border-white/20" title="Decrease Score">
                  <Minus className="w-5 h-5" />
                </button>
                <button onClick={() => adjustScore('A', 1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors border border-white/20" title="Increase Score">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="px-2 md:px-8 flex flex-col items-center">
              <span className="text-xl font-black text-slate-500 italic">VS</span>
            </div>
            
            <div className="flex-1 text-center">
              <h2 className="text-xl md:text-2xl font-bold text-orange-300 mb-1 truncate px-2">{match.teamBName}</h2>
              <div className="text-5xl md:text-6xl font-black text-white drop-shadow-2xl mb-3">{match.teamBScore || 0}</div>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => adjustScore('B', -1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors border border-white/20" title="Decrease Score">
                  <Minus className="w-5 h-5" />
                </button>
                <button onClick={() => adjustScore('B', 1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors border border-white/20" title="Increase Score">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Raid Input Panel */}
        <div className="lg:col-span-2 space-y-6">
          {!match.lineup ? (
            <LineupManager match={match} players={players} onSave={saveLineup} />
          ) : (
            <RaidInputPanel 
              match={match}
              teamA={{ id: match.teamAId, name: match.teamAName }}
              teamB={{ id: match.teamBId, name: match.teamBName }}
              players={players}
              raids={raids}
              onRecordRaid={recordRaid}
              onUndoLastRaid={undoLastRaid}
              editingRaidId={editingRaidId}
              onEditRaid={handleEditRaid}
            />
          )}
        </div>

        {/* Right Column: Mat Status & Raid History */}
        <div className="space-y-6">
          {match.lineup && <MatStatus match={match} players={players} onOpenSubModal={() => setIsSubModalOpen(true)} />}
          
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <div className="p-4 border-b border-slate-200 flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" />
            <h3 className="font-bold text-slate-900">Raid History</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {raids.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No raids recorded yet.</p>
            ) : (
              raids.map((raid) => (
                <div key={raid.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-slate-900">
                      {raid.raidNumber && <span className="text-indigo-600 mr-2">R{raid.raidNumber}</span>}
                      {raid.raidResult === 'Substitution' ? 'Substitution' : `${raid.attackingTeamId === match.teamAId ? match.teamAName : match.teamBName} Raid`}
                      {raid.raiderId && raid.raiderId !== 'manual' && raid.raiderId !== 'substitution' && players.find(p => p.id === raid.raiderId) && (
                        <span className="text-slate-500 font-normal ml-1">
                          by {players.find(p => p.id === raid.raiderId)?.name}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        raid.raidResult === 'Successful' ? 'bg-green-100 text-green-700' :
                        raid.raidResult === 'Unsuccessful' ? 'bg-red-100 text-red-700' :
                        raid.raidResult === 'Super Raid' ? 'bg-purple-100 text-purple-700' :
                        raid.raidResult === 'Substitution' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {raid.raidResult}
                      </span>
                    </div>
                  </div>
                  {raid.raidResult === 'Pending' && (
                    <button
                      onClick={() => handleEditRaid(raid)}
                      className="mt-2 w-full py-1.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Update Raid Data
                    </button>
                  )}
                  <div className="text-slate-600 flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {raid.raidResult === 'Substitution' && raid.outDefenderIds && raid.outDefenderIds.length === 2 && (
                      <span className="text-xs">
                        Out: {players.find(p => p.id === raid.outDefenderIds[0])?.name} | 
                        In: {players.find(p => p.id === raid.outDefenderIds[1])?.name}
                      </span>
                    )}
                    {raid.touchPoints > 0 && <span>Touch: {raid.touchPoints}</span>}
                    {raid.bonusPoints > 0 && <span>Bonus: {raid.bonusPoints}</span>}
                    {raid.tacklePoints > 0 && <span>Tackle: {raid.tacklePoints}</span>}
                    {raid.technicalPoints > 0 && <span>Technical: {raid.technicalPoints}</span>}
                    {raid.allOutPoints > 0 && <span>All Out: {raid.allOutPoints}</span>}
                    {raid.extraPoints !== 0 && raid.extraPoints !== undefined && <span>Points: {raid.extraPoints > 0 ? `+${raid.extraPoints}` : raid.extraPoints}</span>}
                    {raid.selfOutIds && raid.selfOutIds.length > 0 && (
                      <span className="text-xs text-red-600 font-bold">
                        Self Out: {raid.selfOutIds.map((sid: string) => players.find(p => p.id === sid)?.name || sid).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      </div>
      
      <SubstitutionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        match={match}
        players={players}
        onSubstitute={recordSubstitution}
      />
    </div>
  );
};

// Sub-component for Lineup Manager
const LineupManager: React.FC<{ match: any, players: any[], onSave: (lineup: any) => void }> = ({ match, players, onSave }) => {
  const [teamAOnMat, setTeamAOnMat] = useState<string[]>([]);
  const [teamBOnMat, setTeamBOnMat] = useState<string[]>([]);

  const teamAPlayers = players.filter(p => p.teamId === match.teamAId);
  const teamBPlayers = players.filter(p => p.teamId === match.teamBId);

  const togglePlayer = (team: 'A' | 'B', playerId: string) => {
    if (team === 'A') {
      if (teamAOnMat.includes(playerId)) setTeamAOnMat(teamAOnMat.filter(id => id !== playerId));
      else if (teamAOnMat.length < 7) setTeamAOnMat([...teamAOnMat, playerId]);
    } else {
      if (teamBOnMat.includes(playerId)) setTeamBOnMat(teamBOnMat.filter(id => id !== playerId));
      else if (teamBOnMat.length < 7) setTeamBOnMat([...teamBOnMat, playerId]);
    }
  };

  const handleSave = () => {
    onSave({
      teamA: { onMat: teamAOnMat, out: [], bench: teamAPlayers.filter(p => !teamAOnMat.includes(p.id)).map(p => p.id) },
      teamB: { onMat: teamBOnMat, out: [], bench: teamBPlayers.filter(p => !teamBOnMat.includes(p.id)).map(p => p.id) }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-6 h-6 text-indigo-600" />
        <h2 className="text-xl font-bold text-slate-900">Set Starting 7 Lineups</h2>
      </div>
      <p className="text-slate-500 mb-6 text-sm">Select up to 7 starting players for each team. You must do this before recording raids.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="font-bold text-indigo-700 mb-3">{match.teamAName} ({teamAOnMat.length}/7)</h3>
          <div className="space-y-2">
            {teamAPlayers.map(p => (
              <button key={p.id} onClick={() => togglePlayer('A', p.id)} className={`w-full text-left px-3 py-2 rounded border transition-colors ${teamAOnMat.includes(p.id) ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
              </button>
            ))}
            {teamAPlayers.length === 0 && <p className="text-sm text-slate-400">No players added to this team yet.</p>}
          </div>
        </div>
        <div>
          <h3 className="font-bold text-orange-700 mb-3">{match.teamBName} ({teamBOnMat.length}/7)</h3>
          <div className="space-y-2">
            {teamBPlayers.map(p => (
              <button key={p.id} onClick={() => togglePlayer('B', p.id)} className={`w-full text-left px-3 py-2 rounded border transition-colors ${teamBOnMat.includes(p.id) ? 'bg-orange-50 border-orange-500 text-orange-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300'}`}>
                {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
              </button>
            ))}
            {teamBPlayers.length === 0 && <p className="text-sm text-slate-400">No players added to this team yet.</p>}
          </div>
        </div>
      </div>
      <button onClick={handleSave} disabled={teamAOnMat.length === 0 || teamBOnMat.length === 0} className="mt-8 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors">
        Save Lineups & Start Match
      </button>
    </div>
  );
};

// Sub-component for Mat Status
const MatStatus: React.FC<{ match: any, players: any[], onOpenSubModal: () => void }> = ({ match, players, onOpenSubModal }) => {
  if (!match.lineup) return null;
  
  const getPlayerName = (id: string) => players.find(p => p.id === id)?.name || 'Unknown';
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-500" /> Current Mat Status
        </h3>
        <button
          onClick={onOpenSubModal}
          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded flex items-center gap-1 transition-colors border border-indigo-200"
          title="Substitute Player"
        >
          <ArrowRightLeft className="w-3 h-3" /> Sub
        </button>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="border-r border-slate-100 pr-6">
          <h4 className="text-sm font-bold text-indigo-600 mb-2">{match.teamAName} (On Mat: {match.lineup.teamA.onMat?.length || 0})</h4>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {match.lineup.teamA.onMat?.map((id: string) => (
              <span key={id} className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded border border-indigo-200">{getPlayerName(id)}</span>
            ))}
            {(!match.lineup.teamA.onMat || match.lineup.teamA.onMat.length === 0) && <span className="text-xs text-red-500 font-bold">ALL OUT</span>}
          </div>
          <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Out (Revival Queue)</h4>
          <div className="flex flex-wrap gap-1.5">
            {match.lineup.teamA.out?.map((id: string, idx: number) => (
              <span key={id} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200">{idx + 1}. {getPlayerName(id)}</span>
            ))}
            {(!match.lineup.teamA.out || match.lineup.teamA.out.length === 0) && <span className="text-xs text-slate-400">None</span>}
          </div>
        </div>
        <div className="pl-2">
          <h4 className="text-sm font-bold text-orange-600 mb-2">{match.teamBName} (On Mat: {match.lineup.teamB.onMat?.length || 0})</h4>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {match.lineup.teamB.onMat?.map((id: string) => (
              <span key={id} className="px-2 py-1 bg-orange-50 text-orange-700 text-xs font-medium rounded border border-orange-200">{getPlayerName(id)}</span>
            ))}
            {(!match.lineup.teamB.onMat || match.lineup.teamB.onMat.length === 0) && <span className="text-xs text-red-500 font-bold">ALL OUT</span>}
          </div>
          <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Out (Revival Queue)</h4>
          <div className="flex flex-wrap gap-1.5">
            {match.lineup.teamB.out?.map((id: string, idx: number) => (
              <span key={id} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200">{idx + 1}. {getPlayerName(id)}</span>
            ))}
            {(!match.lineup.teamB.out || match.lineup.teamB.out.length === 0) && <span className="text-xs text-slate-400">None</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-component for the complex raid input
const RaidInputPanel: React.FC<{
  match: any,
  teamA: { id: string, name: string },
  teamB: { id: string, name: string },
  players: any[],
  raids: any[],
  onRecordRaid: (attackingTeamId: string, defendingTeamId: string, result: string, points: any, raiderId: string, outDefenderIds: string[]) => void,
  onUndoLastRaid: () => void,
  editingRaidId: string | null,
  onEditRaid: (raid: any) => void
}> = ({ match, teamA, teamB, players, raids, onRecordRaid, onUndoLastRaid, editingRaidId, onEditRaid }) => {
  const [attackingTeamId, setAttackingTeamId] = useState<string>(teamA.id);
  const [raiderId, setRaiderId] = useState<string>('');
  const [touchPoints, setTouchPoints] = useState(0);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [tacklePoints, setTacklePoints] = useState(0);
  const [technicalPoints, setTechnicalPoints] = useState(0);
  const [allOutPoints, setAllOutPoints] = useState(0);
  const [scoringTeamId, setScoringTeamId] = useState<string>('');
  const [outDefenderIds, setOutDefenderIds] = useState<string[]>([]);
  const [selfOutIds, setSelfOutIds] = useState<string[]>([]);

  // Effect to load raid data when editing
  useEffect(() => {
    if (editingRaidId) {
      const raid = raids.find(r => r.id === editingRaidId);
      if (raid) {
        setAttackingTeamId(raid.attackingTeamId);
        setRaiderId(raid.raiderId || '');
        setTouchPoints(raid.touchPoints || 0);
        setBonusPoints(raid.bonusPoints || 0);
        setTacklePoints(raid.tacklePoints || 0);
        setTechnicalPoints(raid.technicalPoints || 0);
        setAllOutPoints(raid.allOutPoints || 0);
        setScoringTeamId(raid.scoringTeamId || '');
        setOutDefenderIds(raid.outDefenderIds || []);
        setSelfOutIds(raid.selfOutIds || []);
      }
    }
  }, [editingRaidId, raids]);

  const [errorMessage, setErrorMessage] = useState('');
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  const defendingTeamId = attackingTeamId === teamA.id ? teamB.id : teamA.id;
  
  // Filter players to only those currently ON THE MAT
  const attTeamKey = attackingTeamId === teamA.id ? 'teamA' : 'teamB';
  const defTeamKey = defendingTeamId === teamA.id ? 'teamA' : 'teamB';
  
  const onMatAttackingIds = match.lineup?.[attTeamKey]?.onMat || [];
  const onMatDefendingIds = match.lineup?.[defTeamKey]?.onMat || [];
  
  const attackingPlayers = players.filter(p => p.teamId === attackingTeamId && onMatAttackingIds.includes(p.id));
  const defendingPlayers = players.filter(p => p.teamId === defendingTeamId && onMatDefendingIds.includes(p.id));

  // Calculate Do or Die: If the last two raids for this team were 'Empty'
  const teamRaids = raids.filter(r => r.attackingTeamId === attackingTeamId);
  const isDoOrDie = teamRaids.length >= 2 && teamRaids[0].raidResult === 'Empty' && teamRaids[1].raidResult === 'Empty';

  useEffect(() => {
    setRaiderId('');
    setOutDefenderIds([]);
    setErrorMessage('');
  }, [attackingTeamId]);

  useEffect(() => {
    if (raiderId) setErrorMessage('');
  }, [raiderId]);

  // Adjust outDefenderIds if touchPoints decreases below selected count
  useEffect(() => {
    if (outDefenderIds.length > touchPoints) {
      setOutDefenderIds(outDefenderIds.slice(0, touchPoints));
    }
  }, [touchPoints, outDefenderIds]);

  const toggleOutDefender = (id: string) => {
    if (outDefenderIds.includes(id)) {
      setOutDefenderIds(outDefenderIds.filter(d => d !== id));
    } else if (outDefenderIds.length < touchPoints) {
      setOutDefenderIds([...outDefenderIds, id]);
    }
  };

  const toggleSelfOut = (id: string) => {
    if (selfOutIds.includes(id)) {
      setSelfOutIds(selfOutIds.filter(d => d !== id));
    } else {
      setSelfOutIds([...selfOutIds, id]);
    }
  };

  const resetForm = () => {
    setTouchPoints(0);
    setBonusPoints(0);
    setTacklePoints(0);
    setTechnicalPoints(0);
    setAllOutPoints(0);
    setScoringTeamId('');
    setRaiderId('');
    setOutDefenderIds([]);
    setSelfOutIds([]);
    setErrorMessage('');
  };

  const handleRecord = (result: string) => {
    onRecordRaid(attackingTeamId, defendingTeamId, result, {
      touch: touchPoints,
      bonus: bonusPoints,
      tackle: tacklePoints,
      technical: technicalPoints,
      allOut: allOutPoints,
      scoringTeamId: allOutPoints > 0 ? scoringTeamId : undefined
    }, raiderId || undefined, outDefenderIds, selfOutIds);
    
    // Auto-switch raid team after recording standard raids
    if (result !== 'Technical Point' && result !== 'Self Out') {
      setAttackingTeamId(defendingTeamId);
    }
    resetForm();
    if (editingRaidId) onEditRaid(null);
  };

  return (
    <div className={`rounded-xl border shadow-sm p-4 transition-colors ${
      editingRaidId ? 'bg-indigo-50 border-indigo-300' : 
      isDoOrDie ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${editingRaidId ? 'text-indigo-600' : isDoOrDie ? 'text-red-600' : 'text-indigo-600'}`} />
          <h2 className={`text-lg font-bold ${editingRaidId ? 'text-indigo-800' : isDoOrDie ? 'text-red-700' : 'text-slate-900'}`}>
            {editingRaidId ? 'Updating Pending Raid' : isDoOrDie ? '🔥 DO OR DIE RAID 🔥' : 'Record Raid'}
          </h2>
          {editingRaidId && (
            <button 
              onClick={() => onEditRaid(null)}
              className="ml-2 px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded border border-slate-300 transition-colors"
            >
              Cancel
            </button>
          )}
          {raids.length > 0 && (
            <div className="relative ml-2">
              {!showUndoConfirm ? (
                <button 
                  onClick={() => setShowUndoConfirm(true)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded flex items-center gap-1 transition-colors border border-slate-300"
                  title="Undo Last Raid"
                >
                  <RotateCcw className="w-3 h-3" /> Undo
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded px-2 py-1">
                  <span className="text-xs font-bold text-red-700 mr-1">Sure?</span>
                  <button 
                    onClick={() => {
                      onUndoLastRaid();
                      setShowUndoConfirm(false);
                    }}
                    className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded transition-colors"
                  >
                    Yes
                  </button>
                  <button 
                    onClick={() => setShowUndoConfirm(false)}
                    className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 text-sm font-bold rounded-lg">
          {errorMessage}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
        <button
          onClick={() => {
            if (!raiderId) {
              setErrorMessage('Please select a raider for a standard raid.');
              return;
            }
            handleRecord('Empty');
          }}
          disabled={isDoOrDie}
          className={`py-2 px-2 font-bold text-[10px] rounded-lg transition-colors border ${
            isDoOrDie 
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60' 
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
          }`}
          title={isDoOrDie ? "Empty raids are not allowed in Do or Die. Raider is out." : ""}
        >
          {isDoOrDie ? 'Empty (X)' : 'Empty Raid'}
        </button>
        <button
          onClick={() => {
            if (!raiderId) {
              setErrorMessage('Please select a raider.');
              return;
            }
            handleRecord('Successful');
          }}
          className="py-2 px-2 bg-green-100 hover:bg-green-200 text-green-800 font-bold text-[10px] rounded-lg transition-colors border border-green-200"
        >
          Successful
        </button>
        <button
          onClick={() => {
            if (!raiderId) {
              setErrorMessage('Please select a raider.');
              return;
            }
            handleRecord('Unsuccessful');
          }}
          className="py-2 px-2 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-[10px] rounded-lg transition-colors border border-red-200"
        >
          Tackled
        </button>
        <button
          onClick={() => {
            if (!raiderId) {
              setErrorMessage('Please select a raider.');
              return;
            }
            handleRecord('Super Raid');
          }}
          className="py-2 px-2 bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold text-[10px] rounded-lg transition-colors border border-purple-200"
        >
          Super Raid
        </button>
        <button
          onClick={() => {
            if (technicalPoints === 0) {
              setErrorMessage('Please increase Technical Points first.');
              return;
            }
            if (!scoringTeamId) {
              setErrorMessage('Please select scoring team for Technical Point.');
              return;
            }
            handleRecord('Technical Point');
          }}
          className="py-2 px-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-[10px] rounded-lg transition-colors border border-amber-200"
        >
          Technical
        </button>
        <button
          onClick={() => {
            if (selfOutIds.length === 0) {
              setErrorMessage('Please select players who are Self Out.');
              return;
            }
            handleRecord('Self Out');
          }}
          className="py-2 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-[10px] rounded-lg transition-colors border border-zinc-200"
        >
          Self Out
        </button>
      </div>

      {/* Team & Raider Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Attacking Team</label>
          <div className="flex gap-2">
            <button
              onClick={() => setAttackingTeamId(teamA.id)}
              className={`flex-1 py-2 px-2 rounded-lg font-bold text-sm transition-all border ${
                attackingTeamId === teamA.id 
                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' 
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
              }`}
            >
              {teamA.name}
            </button>
            <button
              onClick={() => setAttackingTeamId(teamB.id)}
              className={`flex-1 py-2 px-2 rounded-lg font-bold text-sm transition-all border ${
                attackingTeamId === teamB.id 
                  ? 'bg-orange-50 border-orange-600 text-orange-700 shadow-sm' 
                  : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300'
              }`}
            >
              {teamB.name}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Raider</label>
          <select
            value={raiderId}
            onChange={(e) => setRaiderId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-sm"
          >
            <option value="">-- Select Player --</option>
            {attackingPlayers.map(p => (
              <option key={p.id} value={p.id}>
                {p.jerseyNumber ? `#${p.jerseyNumber} - ` : ''}{p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col items-center">
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Touch</label>
            <div className="flex items-center justify-between bg-white border border-slate-300 rounded p-1 w-full">
              <button onClick={() => setTouchPoints(Math.max(0, touchPoints - 1))} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-lg font-black text-slate-800 w-6 text-center">{touchPoints}</span>
              <button onClick={() => setTouchPoints(Math.min(defendingPlayers.length, touchPoints + 1))} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col items-center">
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Bonus</label>
            <div className="flex items-center justify-between bg-white border border-slate-300 rounded p-1 w-full">
              <button onClick={() => setBonusPoints(Math.max(0, bonusPoints - 1))} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-lg font-black text-slate-800 w-6 text-center">{bonusPoints}</span>
              <button onClick={() => setBonusPoints(Math.min(1, bonusPoints + 1))} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col items-center">
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Tackle</label>
            <div className="flex items-center justify-between bg-white border border-slate-300 rounded p-1 w-full">
              <button onClick={() => setTacklePoints(Math.max(0, tacklePoints - 1))} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-lg font-black text-slate-800 w-6 text-center">{tacklePoints}</span>
              <button onClick={() => setTacklePoints(tacklePoints + 1)} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col items-center">
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Technical</label>
            <div className="flex items-center justify-between bg-white border border-slate-300 rounded p-1 w-full">
              <button onClick={() => setTechnicalPoints(Math.max(0, technicalPoints - 1))} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-lg font-black text-slate-800 w-6 text-center">{technicalPoints}</span>
              <button onClick={() => setTechnicalPoints(technicalPoints + 1)} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col items-center justify-center">
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Scoring Team</label>
            <select 
              value={scoringTeamId} 
              onChange={(e) => {
                setScoringTeamId(e.target.value);
                // If it was None, don't auto-set All Out points here to avoid confusion
              }}
              className="w-full text-[10px] p-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
            >
              <option value="">None</option>
              <option value={teamA.id}>{teamA.name}</option>
              <option value={teamB.id}>{teamB.name}</option>
            </select>
          </div>
        </div>
        
        {/* All Out Toggle */}
        <div className="mb-4 flex items-center gap-4 p-2 bg-indigo-50 rounded-lg border border-indigo-100">
          <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wider">All Out (2 pts):</span>
          <div className="flex gap-2 flex-1">
            <button
              onClick={() => {
                if (scoringTeamId === teamA.id && allOutPoints === 2) {
                  setScoringTeamId('');
                  setAllOutPoints(0);
                } else {
                  setScoringTeamId(teamA.id);
                  setAllOutPoints(2);
                }
              }}
              className={`flex-1 py-1.5 px-2 rounded font-bold text-[10px] transition-all border ${
                scoringTeamId === teamA.id && allOutPoints === 2
                  ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                  : 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              All Out By {teamA.name}
            </button>
            <button
              onClick={() => {
                if (scoringTeamId === teamB.id && allOutPoints === 2) {
                  setScoringTeamId('');
                  setAllOutPoints(0);
                } else {
                  setScoringTeamId(teamB.id);
                  setAllOutPoints(2);
                }
              }}
              className={`flex-1 py-1.5 px-2 rounded font-bold text-[10px] transition-all border ${
                scoringTeamId === teamB.id && allOutPoints === 2
                  ? 'bg-orange-600 border-orange-700 text-white shadow-sm'
                  : 'bg-white border-orange-200 text-orange-600 hover:bg-orange-50'
              }`}
            >
              All Out By {teamB.name}
            </button>
          </div>
        </div>

      {/* Self Out Selection */}
      <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 mb-4">
        <label className="block text-[10px] font-bold text-zinc-900 mb-2 uppercase tracking-wider">
          Select Players Self Out (Technical)
        </label>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1">
            <span className="block text-[8px] font-black text-indigo-600 mb-1 uppercase">{teamA.name}</span>
            <div className="flex flex-wrap gap-1">
              {players.filter(p => p.teamId === teamA.id && (match.lineup?.teamA?.onMat || []).includes(p.id)).map(p => (
                <button
                  key={p.id}
                  onClick={() => toggleSelfOut(p.id)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    selfOutIds.includes(p.id) 
                      ? 'bg-zinc-800 border-zinc-900 text-white shadow-sm' 
                      : 'bg-white border-slate-200 text-slate-700 hover:border-zinc-400'
                  }`}
                >
                  {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px bg-zinc-200" />
          <div className="flex-1">
            <span className="block text-[8px] font-black text-orange-600 mb-1 uppercase">{teamB.name}</span>
            <div className="flex flex-wrap gap-1">
              {players.filter(p => p.teamId === teamB.id && (match.lineup?.teamB?.onMat || []).includes(p.id)).map(p => (
                <button
                  key={p.id}
                  onClick={() => toggleSelfOut(p.id)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    selfOutIds.includes(p.id) 
                      ? 'bg-zinc-800 border-zinc-900 text-white shadow-sm' 
                      : 'bg-white border-slate-200 text-slate-700 hover:border-zinc-400'
                  }`}
                >
                  {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Defender Selection (if touch points > 0) */}
      {touchPoints > 0 && (
        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
          <label className="block text-[10px] font-bold text-indigo-900 mb-2 uppercase tracking-wider">
            Select Defenders Touched ({outDefenderIds.length}/{touchPoints})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {defendingPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => toggleOutDefender(p.id)}
                disabled={!outDefenderIds.includes(p.id) && outDefenderIds.length >= touchPoints}
                className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                  outDefenderIds.includes(p.id) 
                    ? 'bg-red-500 border-red-600 text-white shadow-sm' 
                    : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
              </button>
            ))}
            {defendingPlayers.length === 0 && <span className="text-xs text-slate-500">No defenders on mat.</span>}
          </div>
        </div>
      )}
    </div>
  );
};
