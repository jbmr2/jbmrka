import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ref, onValue, get } from 'firebase/database';
import { db } from '../firebase';

const WHISTLE_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
const BUZZER_URL = 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3';

export const LedDisplay: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<any>(null);
  const [teamA, setTeamA] = useState<any>(null);
  const [teamB, setTeamB] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [raidTimer, setRaidTimer] = useState(30);
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  const whistleRef = React.useRef<HTMLAudioElement | null>(null);
  const buzzerRef = React.useRef<HTMLAudioElement | null>(null);
  const serverOffsetRef = React.useRef<number>(0);
  const lastTimerStateRef = React.useRef<boolean>(false);

  useEffect(() => {
    whistleRef.current = new Audio(WHISTLE_URL);
    buzzerRef.current = new Audio(BUZZER_URL);
  }, []);

  const playSound = (type: 'whistle' | 'buzzer') => {
    if (!audioEnabled) return;
    const audio = type === 'whistle' ? whistleRef.current : buzzerRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.error("Audio play failed", e));
    }
  };

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

        // Fetch tournament name
        if (data.tournamentId && !tournament) {
          const tournamentRef = ref(db, `tournaments/${data.tournamentId}`);
          get(tournamentRef).then((snap) => {
            if (snap.exists()) setTournament(snap.val());
          });
        }
      }
    });

    return () => unsubMatch();
  }, [id, tournament]);

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

  useEffect(() => {
    if (match) {
      if (match.isTimerRunning !== lastTimerStateRef.current) {
        playSound('whistle');
        lastTimerStateRef.current = !!match.isTimerRunning;
      }
    }
  }, [match?.isTimerRunning]);

  useEffect(() => {
    if (raidTimer === 0 && match?.isRaidTimerRunning) {
      playSound('buzzer');
    }
  }, [raidTimer, match?.isRaidTimerRunning]);

  if (!match) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden font-mono select-none flex flex-col p-6 text-white relative">
      {/* Audio Enable Overlay */}
      {!audioEnabled && (
        <button 
          onClick={() => setAudioEnabled(true)}
          className="fixed top-4 right-4 z-[200] bg-yellow-500 text-black px-6 py-2 rounded-lg text-sm font-black uppercase tracking-widest shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all animate-pulse"
        >
          Activate Audio
        </button>
      )}
      
      {/* LED DOT OVERLAY */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.15] z-50 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
      <div className="pointer-events-none fixed inset-0 z-40 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      {/* HEADER: Tournament & Status */}
      <div className="flex justify-between items-start mb-8 border-b-4 border-yellow-500 pb-4">
        <div className="flex flex-col">
          <span className="text-yellow-500 text-2xl font-black uppercase tracking-widest animate-pulse">
            {tournament?.name || 'KABADDI CHAMPIONSHIP'}
          </span>
          <span className="text-zinc-500 text-xl font-bold uppercase tracking-tighter">
            LIVE MATCH SCOREBOARD
          </span>
        </div>
        <div className="bg-zinc-900 border-2 border-zinc-700 px-8 py-2 rounded-lg flex flex-col items-center">
          <span className="text-zinc-500 text-sm font-bold uppercase">Match Status</span>
          <span className="text-yellow-400 text-3xl font-black uppercase tracking-widest">
            {match.status === 'Scheduled' ? 'Ready' : match.status}
          </span>
        </div>
      </div>

      {/* MAIN BODY: Teams & Scores */}
      <div className="flex-1 flex items-stretch gap-6 mb-8">
        
        {/* TEAM A */}
        <div className={`flex-1 bg-zinc-900/50 rounded-3xl border-4 transition-all duration-300 flex flex-col overflow-hidden relative ${
          match.raidingTeam === 'A' ? 'border-indigo-500 bg-indigo-900/20 shadow-[0_0_50px_rgba(79,70,229,0.2)]' : 'border-indigo-600/30'
        }`}>
          <div className="bg-indigo-600 py-4 px-6 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-4xl font-black uppercase tracking-tighter truncate max-w-[200px]">
                {teamA?.name || match.teamAName}
              </span>
              {match.raidingTeam === 'A' && (
                <span className="text-yellow-400 text-xs font-black tracking-[0.3em] animate-pulse">RAIDING</span>
              )}
            </div>
            {teamA?.logoUrl && (
              <img src={teamA.logoUrl} alt="Logo" className="w-16 h-16 object-contain bg-white rounded-full p-1 border-2 border-indigo-400" />
            )}
          </div>
          <div className="flex-1 flex items-center justify-center relative">
            {/* BIG SCORE A */}
            <span className={`text-[25rem] font-black leading-none transition-all duration-300 tabular-nums ${
              match.raidingTeam === 'A' ? 'text-white drop-shadow-[0_0_60px_rgba(255,255,255,0.4)]' : 'text-indigo-500 drop-shadow-[0_0_50px_rgba(79,70,229,0.4)]'
            }`}>
              {match.teamAScore || 0}
            </span>
          </div>
        </div>

        {/* CENTER COLUMN: Timers */}
        <div className="w-[30%] flex flex-col gap-6">
          
          {/* MAIN TIMER */}
          <div className="flex-1 bg-zinc-900 rounded-3xl border-4 border-zinc-800 flex flex-col items-center justify-center p-8 shadow-2xl">
            <span className="text-zinc-500 text-2xl font-bold uppercase tracking-widest mb-4">Match Clock</span>
            <div className="text-9xl font-black text-white tabular-nums tracking-tighter drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              {formatTime(timerSeconds)}
            </div>
          </div>

          {/* RAID TIMER */}
          <div className={`flex-1 rounded-3xl border-4 flex flex-col items-center justify-center p-8 transition-colors duration-300 ${
            (match.isRaidTimerRunning || raidTimer < 30) 
              ? (raidTimer <= 5 ? 'bg-red-900/80 border-red-500 animate-pulse' : 'bg-zinc-800 border-yellow-500') 
              : 'bg-zinc-900 border-zinc-800'
          }`}>
            <span className="text-zinc-500 text-2xl font-bold uppercase tracking-widest mb-4">Raid Timer</span>
            {(match.isRaidTimerRunning || raidTimer < 30) ? (
              <div className={`text-[10rem] font-black leading-none tabular-nums ${raidTimer <= 5 ? 'text-red-400' : 'text-yellow-400'} drop-shadow-[0_0_40px_rgba(250,204,21,0.3)]`}>
                {raidTimer}
              </div>
            ) : (
              <div className="text-6xl font-black text-zinc-700 uppercase italic tracking-tighter">WAITING</div>
            )}
          </div>

        </div>

        {/* TEAM B */}
        <div className={`flex-1 bg-zinc-900/50 rounded-3xl border-4 transition-all duration-300 flex flex-col overflow-hidden relative ${
          match.raidingTeam === 'B' ? 'border-orange-500 bg-orange-900/20 shadow-[0_0_50px_rgba(249,115,22,0.2)]' : 'border-orange-600/30'
        }`}>
          <div className="bg-orange-600 py-4 px-6 flex items-center justify-between flex-row-reverse">
            <div className="flex flex-col text-right">
              <span className="text-4xl font-black uppercase tracking-tighter truncate max-w-[200px]">
                {teamB?.name || match.teamBName}
              </span>
              {match.raidingTeam === 'B' && (
                <span className="text-yellow-400 text-xs font-black tracking-[0.3em] animate-pulse">RAIDING</span>
              )}
            </div>
            {teamB?.logoUrl && (
              <img src={teamB.logoUrl} alt="Logo" className="w-16 h-16 object-contain bg-white rounded-full p-1 border-2 border-orange-400" />
            )}
          </div>
          <div className="flex-1 flex items-center justify-center relative">
            {/* BIG SCORE B */}
            <span className={`text-[25rem] font-black leading-none transition-all duration-300 tabular-nums ${
              match.raidingTeam === 'B' ? 'text-white drop-shadow-[0_0_60px_rgba(255,255,255,0.4)]' : 'text-orange-500 drop-shadow-[0_0_50px_rgba(234,88,12,0.4)]'
            }`}>
              {match.teamBScore || 0}
            </span>
          </div>
        </div>

      </div>

      {/* FOOTER: Scrolling or Extra Info */}
      <div className="h-12 bg-zinc-900 rounded-xl border-2 border-zinc-800 flex items-center px-6 overflow-hidden">
        <div className="flex gap-12 animate-[ticker_20s_linear_infinite] whitespace-nowrap">
          <span className="text-yellow-500 font-bold uppercase tracking-widest">
            {tournament?.location || 'PRO KABADDI VENUE'} • {new Date().toLocaleDateString()} • {match.status}
          </span>
          <span className="text-white font-bold uppercase tracking-widest">
            {teamA?.name} VS {teamB?.name} • SCORE: {match.teamAScore} - {match.teamBScore}
          </span>
          <span className="text-yellow-500 font-bold uppercase tracking-widest">
            COURTESY OF PRO KABADDI SCORE SYSTEM • LIVE BROADCAST FEED
          </span>
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};
