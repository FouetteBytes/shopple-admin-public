import React, { useState } from 'react';
import { userManagementApi } from '@/lib/userManagementApi';
import { useGlobalToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Danger, ShieldTick, Logout } from 'iconsax-react';

interface UserManagementControlsProps {
  uid: string;
  isBanned?: boolean;
  onUpdate?: () => void;
}

const PRESET_REASONS = [
  'Violation of Terms of Service',
  'Spam / Bot Activity',
  'Inappropriate Behavior',
  'Suspicious Activity',
  'Harassment',
];

export const UserManagementControls: React.FC<UserManagementControlsProps> = ({ uid, isBanned, onUpdate }) => {
  const { success, error } = useGlobalToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [banExpiresAt, setBanExpiresAt] = useState('');

  const handleBan = async () => {
    const finalReason = banReason === 'custom' ? customReason : banReason;
    
    // Allow empty reasons; the backend defaults to "Violation of terms" when unset.
    
    setIsLoading(true);
    try {
      await userManagementApi.banUser(uid, { 
        reason: finalReason || undefined, 
        expiresAt: banExpiresAt || undefined 
      });
      success('Success', 'User banned successfully');
      setShowBanModal(false);
      onUpdate?.();
    } catch (err) {
      error('Error', 'Failed to ban user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnban = async () => {
    if (!confirm('Are you sure you want to unban this user?')) return;
    setIsLoading(true);
    try {
      await userManagementApi.unbanUser(uid);
      success('Success', 'User unbanned successfully');
      onUpdate?.();
    } catch (err) {
      error('Error', 'Failed to unban user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceLogout = async () => {
    if (!confirm('Are you sure you want to force logout this user?')) return;
    setIsLoading(true);
    try {
      await userManagementApi.forceLogout(uid);
      success('Success', 'User logged out successfully');
    } catch (err) {
      error('Error', 'Failed to force logout user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {isBanned ? (
          <Button variant="outline" onClick={handleUnban} disabled={isLoading} className="border-green-500/50 text-green-400 hover:bg-green-500/10">
            <ShieldTick size={16} className="mr-2" />
            Unban User
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setShowBanModal(true)} disabled={isLoading} className="border-red-500/50 text-red-400 hover:bg-red-500/10">
            <Danger size={16} className="mr-2" />
            Ban User
          </Button>
        )}
        
        <Button variant="outline" onClick={handleForceLogout} disabled={isLoading} className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
          <Logout size={16} className="mr-2" />
          Force Logout
        </Button>
      </div>

      {showBanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 bg-[#1E1F24] border border-white/10 rounded-xl shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Ban User</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Reason</label>
                <select
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-primary-500 mb-2"
                >
                  <option value="" className="bg-[#1E1F24]">No specific reason (Default)</option>
                  {PRESET_REASONS.map((r) => (
                    <option key={r} value={r} className="bg-[#1E1F24]">{r}</option>
                  ))}
                  <option value="custom" className="bg-[#1E1F24]">Other / Custom...</option>
                </select>
                
                {banReason === 'custom' && (
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    rows={3}
                    placeholder="Enter custom reason..."
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Expires At (Optional)</label>
                <input
                  type="datetime-local"
                  value={banExpiresAt}
                  onChange={(e) => setBanExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" onClick={() => setShowBanModal(false)}>Cancel</Button>
              <Button onClick={handleBan} disabled={isLoading} className="bg-red-500 hover:bg-red-600 text-white">
                {isLoading ? 'Banning...' : 'Confirm Ban'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
