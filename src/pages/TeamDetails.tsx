import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, query, orderByChild, equalTo, get, update } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, ArrowLeft, Shield, Camera, User } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  jerseyNumber?: number;
  role?: string;
  photoUrl?: string;
}

export const TeamDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [team, setTeam] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, { totalRaids: number, successfulRaids: number, pointsScored: number }>>({});
  
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: '', jerseyNumber: '', role: 'Raider' });
  
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingPlayerId, setUploadingPlayerId] = useState<string | null>(null);
  const playerFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id || !user) return;

    // Fetch team details
    const teamRef = ref(db, `teams/${id}`);
    const unsubTeam = onValue(teamRef, (snapshot) => {
      if (snapshot.exists()) {
        setTeam({ id: snapshot.key, ...snapshot.val() });
      } else {
        navigate('/');
      }
    }, (error) => console.error("Error fetching team:", error));

    // Listen to players
    const playersQ = query(ref(db, 'players'), orderByChild('teamId'), equalTo(id));
    const unsubPlayers = onValue(playersQ, (snapshot) => {
      const p: Player[] = [];
      snapshot.forEach(childSnapshot => {
        p.push({ id: childSnapshot.key, ...childSnapshot.val() } as Player);
      });
      setPlayers(p);
    }, (error) => console.error("Error fetching players:", error));

    // Listen to matches to aggregate stats
    let unsubMatches = () => {};
    if (team?.tournamentId) {
      const matchesQ = query(ref(db, 'matches'), orderByChild('tournamentId'), equalTo(team.tournamentId));
      unsubMatches = onValue(matchesQ, (snapshot) => {
        const stats: Record<string, { totalRaids: number, successfulRaids: number, pointsScored: number }> = {};
        
        snapshot.forEach(child => {
          const m = child.val();
          if (m.teamAId === id || m.teamBId === id) {
            if (m.raids) {
              Object.values(m.raids).forEach((raid: any) => {
                if (raid.attackingTeamId === id && raid.raiderId) {
                  if (!stats[raid.raiderId]) {
                    stats[raid.raiderId] = { totalRaids: 0, successfulRaids: 0, pointsScored: 0 };
                  }
                  stats[raid.raiderId].totalRaids += 1;
                  if (raid.raidResult === 'Successful' || raid.raidResult === 'Super Raid') {
                    stats[raid.raiderId].successfulRaids += 1;
                  }
                  stats[raid.raiderId].pointsScored += (raid.touchPoints || 0) + (raid.bonusPoints || 0);
                }
              });
            }
          }
        });
        setPlayerStats(stats);
      });
    }

    return () => {
      unsubTeam();
      unsubPlayers();
      unsubMatches();
    };
  }, [id, user, navigate, team?.tournamentId]);

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !team || !newPlayer.name.trim()) return;

    try {
      const data: any = {
        name: newPlayer.name.trim(),
        teamId: id,
        tournamentId: team.tournamentId,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      };
      if (newPlayer.jerseyNumber) data.jerseyNumber = parseInt(newPlayer.jerseyNumber);
      if (newPlayer.role) data.role = newPlayer.role;
      
      const newPlayerRef = push(ref(db, 'players'));
      await set(newPlayerRef, data);
      
      setIsCreatingPlayer(false);
      setNewPlayer({ name: '', jerseyNumber: '', role: 'Raider' });
    } catch (error) {
      console.error("Error creating player:", error);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !team) return;
    
    setIsUploadingLogo(true);
    try {
      const storage = getStorage();
      const fileRef = storageRef(storage, `team-logos/${team.id}/${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      
      await update(ref(db, `teams/${team.id}`), {
        logoUrl: url
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      alert("Failed to upload logo. Please ensure Firebase Storage rules are configured to allow uploads.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handlePlayerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingPlayerId || !team) return;
    
    try {
      const storage = getStorage();
      // Using team-logos path to leverage existing storage rules
      const fileRef = storageRef(storage, `team-logos/${team.id}/players/${uploadingPlayerId}/${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      
      await update(ref(db, `players/${uploadingPlayerId}`), {
        photoUrl: url
      });
    } catch (error) {
      console.error("Error uploading player photo:", error);
      alert("Failed to upload photo. Please ensure Firebase Storage rules are configured to allow uploads.");
    } finally {
      setUploadingPlayerId(null);
      if (playerFileInputRef.current) playerFileInputRef.current.value = '';
    }
  };

  const triggerPlayerPhotoUpload = (playerId: string) => {
    setUploadingPlayerId(playerId);
    playerFileInputRef.current?.click();
  };

  if (!team) return <div className="flex justify-center p-8">Loading...</div>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to={`/tournaments/${team.tournamentId}`} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        
        <div className="relative group">
          <div className="w-16 h-16 rounded-full bg-indigo-100 border-2 border-white shadow-sm flex items-center justify-center overflow-hidden shrink-0">
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" />
            ) : (
              <Shield className="w-8 h-8 text-indigo-400" />
            )}
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingLogo}
            className="absolute bottom-0 right-0 p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
            title="Upload Team Logo"
          >
            <Camera className="w-3 h-3" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleLogoUpload} 
            accept="image/*" 
            className="hidden" 
          />
          <input 
            type="file" 
            ref={playerFileInputRef} 
            onChange={handlePlayerPhotoUpload} 
            accept="image/*" 
            className="hidden" 
          />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            {team.name}
            {team.shortName && <span className="text-xl text-slate-400 font-normal">({team.shortName})</span>}
          </h1>
          <p className="text-slate-500 mt-1">Manage players for this team.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Roster ({players.length})
          </h2>
          <button
            onClick={() => setIsCreatingPlayer(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Player
          </button>
        </div>

        {isCreatingPlayer && (
          <form onSubmit={handleCreatePlayer} className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Player Name *</label>
                <input
                  type="text"
                  required
                  value={newPlayer.name}
                  onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Pardeep Narwal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jersey #</label>
                <input
                  type="number"
                  value={newPlayer.jerseyNumber}
                  onChange={(e) => setNewPlayer({ ...newPlayer, jerseyNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., 9"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={newPlayer.role}
                  onChange={(e) => setNewPlayer({ ...newPlayer, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Raider">Raider</option>
                  <option value="Defender">Defender</option>
                  <option value="All-Rounder">All-Rounder</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingPlayer(false)}
                className="px-3 py-1.5 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors"
              >
                Save Player
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-500">
                <th className="py-3 px-4 font-medium">Jersey</th>
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium text-center">Total Raids</th>
                <th className="py-3 px-4 font-medium text-center">Successful</th>
                <th className="py-3 px-4 font-medium text-center">Points</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && !isCreatingPlayer && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No players added yet.
                  </td>
                </tr>
              )}
              {players.map(player => {
                const stats = playerStats[player.id] || { totalRaids: 0, successfulRaids: 0, pointsScored: 0 };
                return (
                  <tr key={player.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-slate-500 font-mono">{player.jerseyNumber || '-'}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-3">
                        <div 
                          className="relative w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer group"
                          onClick={() => triggerPlayerPhotoUpload(player.id)}
                          title="Upload Player Photo"
                        >
                          {player.photoUrl ? (
                            <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                          ) : (
                            <User className="w-5 h-5 text-slate-400 group-hover:opacity-50 transition-opacity" />
                          )}
                          {uploadingPlayerId === player.id ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                              <Camera className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        {player.name}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        player.role === 'Raider' ? 'bg-green-100 text-green-800' :
                        player.role === 'Defender' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {player.role || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">{stats.totalRaids}</td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">{stats.successfulRaids}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-indigo-600">{stats.pointsScored}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
