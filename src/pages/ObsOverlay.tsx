import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';

export const ObsOverlay: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<any>(null);
  const [teamA, setTeamA] = useState<any>(null);
  const [teamB, setTeamB] = useState<any>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [raidTimer, setRaidTimer] = useState(30);
  const serverOffsetRef = React.useRef<number>(0);

  // Sync with server time offset
  useEffect(() => {
    const offsetRef = ref(db, ".info/serverTimeOffset");
    const unsub = onValue(offsetRef, (snap) => {
      serverOffsetRef.current = snap.val() || 0;
    });
    return () => unsub();
  }, []);

  const getServerTime = () => Date.now() + serverOffsetRef.current;

  useEffect(() => {
    if (!id) return;

    const matchRef = ref(db, `matches/${id}`);
    const unsubMatch = onValue(matchRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setMatch({ id: snapshot.key, ...data });
        
        // Calculate main timer
        let currentSeconds = data.timerSeconds !== undefined ? data.timerSeconds : (data.initialTimerSeconds || 2700);
        if (data.isTimerRunning && data.timerUpdatedAt) {
          const elapsed = Math.floor((getServerTime() - data.timerUpdatedAt) / 1000);
          currentSeconds = Math.max(0, currentSeconds - elapsed);
        }
        setTimerSeconds(currentSeconds);

        // Calculate raid timer
        let currentRaidSeconds = data.raidTimerSeconds !== undefined ? data.raidTimerSeconds : 30;
        if (data.isRaidTimerRunning && data.raidTimerUpdatedAt) {
          const elapsed = Math.floor((getServerTime() - data.raidTimerUpdatedAt) / 1000);
          currentRaidSeconds = Math.max(0, currentRaidSeconds - elapsed);
        }
        setRaidTimer(currentRaidSeconds);
      }
    });

    return () => unsubMatch();
  }, [id]);

  useEffect(() => {
    if (!match) return;

    const teamARef = ref(db, `teams/${match.teamAId}`);
    const unsubA = onValue(teamARef, (snapshot) => {
      if (snapshot.exists()) setTeamA(snapshot.val());
    });

    const teamBRef = ref(db, `teams/${match.teamBId}`);
    const unsubB = onValue(teamBRef, (snapshot) => {
      if (snapshot.exists()) setTeamB(snapshot.val());
    });

    return () => {
      unsubA();
      unsubB();
    };
  }, [match?.teamAId, match?.teamBId]);

  // Main timer interval
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (match?.isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [match?.isTimerRunning]);

  // Raid timer interval
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (match?.isRaidTimerRunning) {
      interval = setInterval(() => {
        setRaidTimer(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [match?.isRaidTimerRunning]);

  if (!match) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden font-sans">
      {/* Left Raid Box (Team A) */}
      {match.raidingTeam === 'A' && (match.isRaidTimerRunning || raidTimer < 30) && (
        <div className="absolute left-8 bottom-8 w-24 h-24 bg-slate-900/90 border-4 border-indigo-600 rounded-xl flex flex-col items-center justify-center shadow-2xl animate-in slide-in-from-left duration-300">
          <span className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-1">RAID</span>
          <span className={`text-4xl font-mono font-black tabular-nums leading-none ${raidTimer <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {raidTimer}
          </span>
        </div>
      )}

      {/* Right Raid Box (Team B) */}
      {match.raidingTeam === 'B' && (match.isRaidTimerRunning || raidTimer < 30) && (
        <div className="absolute right-8 bottom-8 w-24 h-24 bg-slate-900/90 border-4 border-orange-600 rounded-xl flex flex-col items-center justify-center shadow-2xl animate-in slide-in-from-right duration-300">
          <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest mb-1">RAID</span>
          <span className={`text-4xl font-mono font-black tabular-nums leading-none ${raidTimer <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {raidTimer}
          </span>
        </div>
      )}

      {/* Scoreboard (Lower Third) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center shadow-2xl rounded-xl overflow-hidden bg-slate-900/90 backdrop-blur-sm border border-white/10">
        
        {/* Team A */}
        <div className={`flex items-center pl-6 pr-4 py-3 min-w-[280px] transition-all duration-300 ${
          match.raidingTeam === 'A' ? 'bg-indigo-700 ring-4 ring-orange-500/50' : 'bg-indigo-600/90'
        }`}>
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-inner border-2 border-indigo-300">
            {teamA?.logoUrl ? (
              <img src={teamA.logoUrl} alt={match.teamAName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-indigo-700 font-bold text-xl">{match.teamAName?.substring(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="ml-4 flex-1">
            <h2 className="text-white font-bold text-xl uppercase tracking-wider truncate max-w-[150px]">{match.teamAName}</h2>
            {match.raidingTeam === 'A' && (
              <div className="text-[10px] font-black text-orange-400 animate-pulse tracking-[0.2em] leading-none uppercase mt-1">RAIDING</div>
            )}
          </div>
          <div className="ml-4 text-5xl font-black text-white w-16 text-center drop-shadow-md">
            {match.teamAScore || 0}
          </div>
        </div>

        {/* Center Info */}
        <div className="flex flex-col items-center justify-center px-8 py-2 bg-slate-900/95 min-w-[200px]">
          <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
            {match.status === 'Scheduled' ? 'First Half' : match.status}
          </div>
          <div className="text-4xl font-mono font-bold text-white drop-shadow-md">
            {formatTime(timerSeconds)}
          </div>
        </div>

        {/* Team B */}
        <div className={`flex items-center pr-6 pl-4 py-3 min-w-[280px] flex-row-reverse transition-all duration-300 ${
          match.raidingTeam === 'B' ? 'bg-orange-700 ring-4 ring-indigo-500/50' : 'bg-orange-600/90'
        }`}>
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-inner border-2 border-orange-300">
            {teamB?.logoUrl ? (
              <img src={teamB.logoUrl} alt={match.teamBName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-orange-700 font-bold text-xl">{match.teamBName?.substring(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="mr-4 flex-1 text-right">
            <h2 className="text-white font-bold text-xl uppercase tracking-wider truncate max-w-[150px]">{match.teamBName}</h2>
            {match.raidingTeam === 'B' && (
              <div className="text-[10px] font-black text-indigo-300 animate-pulse tracking-[0.2em] leading-none uppercase mt-1">RAIDING</div>
            )}
          </div>
          <div className="mr-4 text-5xl font-black text-white w-16 text-center drop-shadow-md">
            {match.teamBScore || 0}
          </div>
        </div>
      </div>

    </div>
  );
};
