import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ref, onValue, query } from 'firebase/database';
import { db } from '../firebase';
import { ArrowLeft, History, Users, Swords, Activity, Monitor, Tv, Trophy } from 'lucide-react';

export const MatchDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<any>(null);
  const [raids, setRaids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const serverOffsetRef = useRef<number>(0);

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
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching match:", error);
      setLoading(false);
    });

    const raidsQ = query(ref(db, `matches/${id}/raids`));
    const unsubRaids = onValue(raidsQ, (snapshot) => {
      const r: any[] = [];
      snapshot.forEach(child => {
        r.push({ id: child.key, ...child.val() });
      });
      r.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRaids(r);
    });

    return () => {
      unsubMatch();
      unsubRaids();
    };
  }, [id]);

  if (loading) return <div className="flex justify-center p-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  
  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
          <Swords className="w-10 h-10 text-slate-300" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 uppercase mb-2">Match Not Found</h2>
        <p className="text-slate-500 mb-8 max-w-xs">This match record might have been deleted or is currently unavailable.</p>
        <Link to="/matches" className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg hover:bg-indigo-700 transition-all">
          Go to Arena
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <Link to="/matches" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-bold uppercase text-[10px] tracking-widest">
          <ArrowLeft className="w-4 h-4" /> Back to Arena
        </Link>
        <div className="flex gap-3">
          <Link to={`/obs/${id}`} target="_blank" className="p-2 bg-white border border-slate-200 rounded-xl hover:border-indigo-600 transition-all shadow-sm">
            <Monitor className="w-4 h-4 text-indigo-600" />
          </Link>
          <Link to={`/led/${id}`} target="_blank" className="p-2 bg-white border border-slate-200 rounded-xl hover:border-orange-600 transition-all shadow-sm">
            <Tv className="w-4 h-4 text-orange-600" />
          </Link>
        </div>
      </div>

      {/* Scoreboard Card */}
      <div className="bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl border border-white/5">
        <div className="bg-white/5 backdrop-blur-sm p-4 flex justify-between items-center border-b border-white/5">
          <div className="flex items-center gap-4">
            <span className="text-white/40 font-black uppercase text-[10px] tracking-[0.3em]">{match.status || 'Scheduled'}</span>
            {match.tournamentId && (
              <Link to={`/tournaments/${match.tournamentId}/view`} className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1">
                <Trophy className="w-3 h-3" />
                {match.tournamentName || 'Tournament Arena'}
              </Link>
            )}
          </div>
        </div>

        <div className="p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-12 relative">
          {/* Team A */}
          <div className="flex-1 flex flex-col items-center md:items-end text-center md:text-right">
            <div className="w-24 h-24 rounded-full bg-white/10 border-4 border-indigo-500/30 flex items-center justify-center mb-6 shadow-2xl relative">
              <span className="text-4xl font-black text-white">{match.teamAName.substring(0, 2).toUpperCase()}</span>
              {match.raidingTeam === 'A' && (
                <div className="absolute -bottom-2 bg-indigo-500 text-white text-[8px] font-black px-3 py-1 rounded-full animate-pulse shadow-lg ring-4 ring-slate-900">RAIDING</div>
              )}
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight mb-2">{match.teamAName}</h2>
            <div className="text-7xl md:text-8xl font-black text-indigo-500 tabular-nums drop-shadow-[0_0_30px_rgba(79,70,229,0.3)]">{match.teamAScore || 0}</div>
          </div>

          {/* VS Divider */}
          <div className="flex flex-col items-center gap-6">
            <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent hidden md:block"></div>
            <div className="text-white/20 font-black text-4xl italic tracking-tighter">VS</div>
            <div className="w-px h-16 bg-gradient-to-t from-transparent via-white/10 to-transparent hidden md:block"></div>
          </div>

          {/* Team B */}
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
            <div className="w-24 h-24 rounded-full bg-white/10 border-4 border-orange-500/30 flex items-center justify-center mb-6 shadow-2xl relative">
              <span className="text-4xl font-black text-white">{match.teamBName.substring(0, 2).toUpperCase()}</span>
              {match.raidingTeam === 'B' && (
                <div className="absolute -bottom-2 bg-orange-500 text-white text-[8px] font-black px-3 py-1 rounded-full animate-pulse shadow-lg ring-4 ring-slate-900">RAIDING</div>
              )}
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight mb-2">{match.teamBName}</h2>
            <div className="text-7xl md:text-8xl font-black text-orange-500 tabular-nums drop-shadow-[0_0_30px_rgba(249,115,22,0.3)]">{match.teamBScore || 0}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Raid History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h3 className="font-black text-slate-900 uppercase tracking-tight">Raid Timeline</h3>
          </div>
          
          <div className="space-y-3">
            {raids.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 border-dashed text-slate-400 font-bold uppercase text-xs tracking-widest">No raids recorded yet</div>
            ) : (
              raids.map((raid) => (
                <div key={raid.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-200 transition-all">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                    raid.attackingTeamId === match.teamAId ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
                  }`}>
                    {raid.attackingTeamId === match.teamAId ? 'A' : 'B'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-black text-slate-900 uppercase text-[11px] tracking-tight truncate">{raid.raidResult}</span>
                      <span className="text-[9px] font-bold text-slate-400">{new Date(raid.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium truncate">
                      {raid.touchPoints > 0 && `${raid.touchPoints} Touch `}
                      {raid.bonusPoints > 0 && `${raid.bonusPoints} Bonus `}
                      {raid.tacklePoints > 0 && `${raid.tacklePoints} Tackle `}
                      {raid.allOutPoints > 0 && `${raid.allOutPoints} All Out `}
                    </p>
                  </div>
                  <div className="text-xl font-black text-slate-900 tabular-nums">+{raid.totalPointsScored || 0}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Side Info */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Swords className="w-5 h-5 text-indigo-600" />
              <h3 className="font-black text-slate-900 uppercase tracking-tight">Match Info</h3>
            </div>
            <div className="space-y-4">
              {match.tournamentName && (
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tournament</span>
                  <span className="text-xs font-bold text-indigo-600 uppercase">{match.tournamentName}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</span>
                <span className="text-xs font-bold text-slate-800">{match.matchDate ? new Date(match.matchDate).toLocaleDateString() : 'TBD'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Time</span>
                <span className="text-xs font-bold text-slate-800">{match.matchDate ? new Date(match.matchDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Raids</span>
                <span className="text-xs font-bold text-slate-800">{raids.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
