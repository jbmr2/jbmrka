import React, { useState } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';

interface SubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: any;
  players: any[];
  onSubstitute: (teamId: string, playerOutId: string, playerInId: string) => void;
}

export const SubstitutionModal: React.FC<SubstitutionModalProps> = ({ isOpen, onClose, match, players, onSubstitute }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>(match?.teamAId || '');
  const [playerOutId, setPlayerOutId] = useState<string>('');
  const [playerInId, setPlayerInId] = useState<string>('');

  if (!isOpen || !match || !match.lineup) return null;

  const teamKey = selectedTeam === match.teamAId ? 'teamA' : 'teamB';
  const teamLineup = match.lineup[teamKey];
  
  const onMatPlayers = teamLineup?.onMat?.map((id: string) => players.find(p => p.id === id)).filter(Boolean) || [];
  const benchPlayers = teamLineup?.bench?.map((id: string) => players.find(p => p.id === id)).filter(Boolean) || [];

  const handleSubstitute = () => {
    if (selectedTeam && playerOutId && playerInId) {
      onSubstitute(selectedTeam, playerOutId, playerInId);
      setPlayerOutId('');
      setPlayerInId('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
            Substitute Player
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Team</label>
            <select
              value={selectedTeam}
              onChange={(e) => {
                setSelectedTeam(e.target.value);
                setPlayerOutId('');
                setPlayerInId('');
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={match.teamAId}>{match.teamAName}</option>
              <option value={match.teamBId}>{match.teamBName}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Player Out (On Mat)</label>
              <select
                value={playerOutId}
                onChange={(e) => setPlayerOutId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Player</option>
                {onMatPlayers.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Player In (Bench)</label>
              <select
                value={playerInId}
                onChange={(e) => setPlayerInId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Player</option>
                {benchPlayers.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          {benchPlayers.length === 0 && (
            <p className="text-sm text-red-500">No players available on the bench for this team.</p>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubstitute}
            disabled={!selectedTeam || !playerOutId || !playerInId}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Substitution
          </button>
        </div>
      </div>
    </div>
  );
};
