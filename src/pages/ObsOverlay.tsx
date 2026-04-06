import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';

const WHISTLE_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
const BUZZER_URL = 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3';

export const ObsOverlay: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<any>(null);
  const [teamA, setTeamA] = useState<any>(null);
  const [teamB, setTeamB] = useState<any>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [tournamentAudio, setTournamentAudio] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const whistleRef = React.useRef<HTMLAudioElement | null>(null);
  const buzzerRef = React.useRef<HTMLAudioElement | null>(null);
  const serverOffsetRef = React.useRef<number>(0);
  const lastTimerStateRef = React.useRef<boolean>(false);

  useEffect(() => {
    whistleRef.current = new Audio(WHISTLE_URL);
    buzzerRef.current = new Audio(BUZZER_URL);
  }, []);

  const playSound = (type: 'whistle' | 'buzzer') => {
    if (!audioEnabled || !tournamentAudio) return;
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
        
        // Fetch tournament audio setting if applicable
        if (data.tournamentId) {
          onValue(ref(db, `tournaments/${data.tournamentId}/audioEnabled`), (snap) => {
            if (snap.exists()) {
              setTournamentAudio(snap.val());
            }
          });
        }
      }
      setLoading(false);
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

  useEffect(() => {
    if (match) {
      if (match.isTimerRunning !== lastTimerStateRef.current) {
        playSound('whistle');
        lastTimerStateRef.current = !!match.isTimerRunning;
      }
    }
  }, [match?.isTimerRunning]);

  if (loading) return null; // Overlays should be invisible while loading
  if (!match) return null; // Overlays should be invisible if match doesn't exist

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden font-sans relative">
      {/* Hidden Audio Enable Overlay */}
      {!audioEnabled && (
        <button 
          onClick={() => setAudioEnabled(true)}
          className="fixed inset-0 z-[200] bg-transparent cursor-pointer"
        >
        </button>
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

        {/* VS / Divider */}
        <div className="flex items-center justify-center px-4 py-2 bg-slate-900/95">
          <div className="text-slate-500 text-xs font-black uppercase tracking-widest">VS</div>
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
