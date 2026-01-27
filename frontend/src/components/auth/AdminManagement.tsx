'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalToast } from '@/contexts/ToastContext';
import { adminApi, UserRecord } from '@/lib/auth';
import { validatePassword } from '@/lib/password-security';
import SecurePasswordChange from './SecurePasswordChange';
import SecurityDashboard from './SecurityDashboard';
import { 
  User, 
  UserAdd, 
  UserRemove, 
  Edit2, 
  Lock1, 
  Activity, 
  Crown,
  Shield,
  InfoCircle,
  Trash,
  Key,
  Eye,
  EyeSlash,
  SecuritySafe
} from 'iconsax-react';
import { PageHeader } from '@/components/layout/PageHeader';
import PageContent from '@/components/layout/PageContent';
import { PageHero } from '@/components/shared/PageHero';

export default function AdminManagement() {
  const { user } = useAuth();
  const router = useRouter();
  const { success, error: showError, info, confirm } = useGlobalToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEmergencyReset, setShowEmergencyReset] = useState(false);
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  // Edit user form state
  const [editForm, setEditForm] = useState({
    displayName: '',
  });
  
  // Emergency reset form state
  const [emergencyResetForm, setEmergencyResetForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  const formatDate = useCallback((iso: string) => new Date(iso).toLocaleDateString(), []);

  // Validate password on change
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const userList = await adminApi.listUsers();
      setUsers(userList);
    } catch (error: any) {
      showError('Error Loading Users', error.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const handleUpdateUser = async (uid: string, data: { isAdmin?: boolean; isSuperAdmin?: boolean; disabled?: boolean; displayName?: string }) => {
    try {
      await adminApi.updateUser(uid, data);
      success('User Updated', 'User updated successfully');
      loadUsers();
      setEditingUser(null);
    } catch (error: any) {
      showError('Update Failed', error.message);
    }
  };

  const handleEditClick = (user: UserRecord) => {
    setEditingUser(user);
    setEditForm({
      displayName: user.displayName || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    await handleUpdateUser(editingUser.uid, {
      displayName: editForm.displayName,
    });
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    const confirmed = await confirm(
      'Delete User',
      `Are you sure you want to delete user ${email}? This action cannot be undone.`
    );
    
    if (confirmed) {
      try {
        await adminApi.deleteUser(uid);
        success('User Deleted', `User ${email} deleted successfully`);
        loadUsers();
      } catch (error: any) {
        showError('Deletion Failed', error.message);
      }
    }
  };

  const handleEmergencyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUser) return;
    
    if (emergencyResetForm.newPassword !== emergencyResetForm.confirmPassword) {
      showError('Password Mismatch', 'Passwords do not match');
      return;
    }

    const validation = validatePassword(emergencyResetForm.newPassword);
    if (!validation.isValid) {
      showError('Invalid Password', validation.errors.join(', '));
      return;
    }

    const confirmed = await confirm(
      'Emergency Password Reset',
      `Are you sure you want to reset the password for ${selectedUser.email}? This is an emergency action that will be logged.`
    );
    
    if (confirmed) {
      try {
        await adminApi.emergencyPasswordReset(selectedUser.uid, emergencyResetForm.newPassword);
        success('Password Reset', `Password reset successfully for ${selectedUser.email}`);
        setEmergencyResetForm({ newPassword: '', confirmPassword: '' });
        setShowEmergencyReset(false);
        setSelectedUser(null);
      } catch (error: any) {
        showError('Reset Failed', error.message);
      }
    }
  };

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Allow admins to view but restrict functionality for non-super admins
  if (!user?.isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <InfoCircle size={20} className="text-red-400 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Access Denied
              </h3>
              <div className="mt-1 text-sm text-red-700">
                Admin privileges are required to access this page.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader 
        title="Admin Management" 
        subtitle="Manage admin accounts and user permissions"
        icon={Shield}
        hideSearch={true}
        hideNotification={true}
      >
          <button
            onClick={() => setShowSecurityDashboard(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg flex items-center space-x-2 text-xs"
          >
            <SecuritySafe size={16} />
            <span className="hidden md:inline">Security</span>
          </button>
          <button
            onClick={() => setShowChangePassword(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center space-x-2 text-xs"
          >
            <Lock1 size={16} />
            <span className="hidden md:inline">Change Password</span>
          </button>
          {/* Only super admins can create users */}
          {user?.isSuperAdmin && (
            <button
              onClick={() => router.push('/app/admin/accounts')}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center space-x-2 text-xs"
            >
              <UserAdd size={16} />
              <span className="hidden md:inline">Account Factory</span>
            </button>
          )}
      </PageHeader>

      <PageContent>
        <div className="space-y-6">
          {/* Show warning for regular admins */}
          {user?.isAdmin && !user?.isSuperAdmin && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex">
                <InfoCircle size={20} className="text-blue-400 mt-0.5" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Limited Access
                  </h3>
                  <div className="mt-1 text-sm text-blue-700">
                    You can view users and change your password, but user management requires super admin privileges.
                  </div>
                </div>
              </div>
            </div>
          )}
          <PageHero
            title="Admin Management"
            description="Manage admin accounts and user permissions"
            stats={[
                {
                    label: 'Total Users',
                    value: users.length,
                    subtext: 'Registered accounts',
                    icon: User,
                    color: 'blue'
                },
                {
                    label: 'Super Admins',
                    value: users.filter(u => u.customClaims?.superAdmin).length,
                    subtext: 'Full system access',
                    icon: Crown,
                    color: 'amber'
                },
                {
                    label: 'Admins',
                    value: users.filter(u => u.customClaims?.admin && !u.customClaims?.superAdmin).length,
                    subtext: 'Limited management access',
                    icon: Shield,
                    color: 'purple'
                }
            ]}
          />

          {user?.isSuperAdmin && (
            <div className="rounded-2xl border border-dashed border-green-200 bg-green-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-green-800">Need to onboard a new admin?</p>
                <p className="text-xs text-green-700">Use the Account Factory to create admin or super admin profiles with enforced first-login password reset.</p>
              </div>
              <button
                onClick={() => router.push('/app/admin/accounts')}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-green-700"
              >
                <UserAdd size={14} />
                Open Account Factory
              </button>
            </div>
          )}

      {/* Users Table */}
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h2 className="text-lg font-semibold text-gray-900">User Accounts</h2>
        </div>
        
        {loading ? (
          <div className="p-6 text-center">
            <Activity size={24} className="animate-spin mx-auto text-blue-600" />
            <p className="mt-2 text-gray-600">Loading users...</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((userRecord) => (
                      <tr key={userRecord.uid} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                <User size={20} className="text-gray-600" />
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {userRecord.displayName || 'No display name'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {userRecord.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            {userRecord.customClaims?.superAdmin && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                <Crown size={12} className="mr-1" />
                                Super Admin
                              </span>
                            )}
                            {userRecord.customClaims?.admin && !userRecord.customClaims?.superAdmin && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                <Shield size={12} className="mr-1" />
                                Admin
                              </span>
                            )}
                            {!userRecord.customClaims?.admin && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                <User size={12} className="mr-1" />
                                User
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            userRecord.disabled 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {userRecord.disabled ? 'Disabled' : 'Active'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(userRecord.creationTime)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {userRecord.uid !== user.uid ? (
                            <div className="flex items-center space-x-2">
                              {user?.isSuperAdmin && (
                                <>
                                  <button
                                    onClick={() => handleEditClick(userRecord)}
                                    className="text-blue-600 hover:text-blue-900"
                                    title="Edit User"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedUser(userRecord);
                                      setShowEmergencyReset(true);
                                    }}
                                    className="text-orange-600 hover:text-orange-900"
                                    title="Emergency Password Reset"
                                  >
                                    <Key size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleUpdateUser(userRecord.uid, { 
                                      disabled: !userRecord.disabled 
                                    })}
                                    className="text-yellow-600 hover:text-yellow-900"
                                    title={userRecord.disabled ? 'Enable User' : 'Disable User'}
                                  >
                                    {userRecord.disabled ? <Eye size={16} /> : <EyeSlash size={16} />}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(userRecord.uid, userRecord.email)}
                                    className="text-red-600 hover:text-red-900"
                                    title="Delete User"
                                  >
                                    <Trash size={16} />
                                  </button>
                                </>
                              )}
                              {!user?.isSuperAdmin && (
                                <span className="text-gray-400 text-xs">Super Admin Required</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Your Account</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="md:hidden space-y-4 px-4 py-4">
              {users.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
                  No users found.
                </div>
              ) : (
                users.map((userRecord) => (
                  <div key={userRecord.uid} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{userRecord.displayName || 'No display name'}</p>
                        <p className="text-xs text-gray-500 break-all">{userRecord.email}</p>
                      </div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        userRecord.disabled 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {userRecord.disabled ? 'Disabled' : 'Active'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {userRecord.customClaims?.superAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                          <Crown size={12} />
                          Super Admin
                        </span>
                      )}
                      {userRecord.customClaims?.admin && !userRecord.customClaims?.superAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          <Shield size={12} />
                          Admin
                        </span>
                      )}
                      {!userRecord.customClaims?.admin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                          <User size={12} />
                          User
                        </span>
                      )}
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                      Created {formatDate(userRecord.creationTime)}
                    </div>

                    <div className="mt-4">
                      {userRecord.uid !== user.uid ? (
                        user?.isSuperAdmin ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleEditClick(userRecord)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-100 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                              title="Edit profile"
                            >
                              <Edit2 size={14} />
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(userRecord);
                                setShowEmergencyReset(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-orange-100 px-3 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                              title="Emergency Password Reset"
                            >
                              <Key size={14} />
                              Reset
                            </button>
                            <button
                              onClick={() => handleUpdateUser(userRecord.uid, { disabled: !userRecord.disabled })}
                              className="inline-flex items-center gap-1 rounded-md border border-yellow-100 px-3 py-2 text-xs font-semibold text-yellow-600 hover:bg-yellow-50"
                              title={userRecord.disabled ? 'Enable User' : 'Disable User'}
                            >
                              {userRecord.disabled ? <Eye size={14} /> : <EyeSlash size={14} />}
                              {userRecord.disabled ? 'Enable' : 'Disable'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(userRecord.uid, userRecord.email)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                              title="Delete User"
                            >
                              <Trash size={14} />
                              Delete
                            </button>
                            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-gray-500">
                              <Shield size={14} />
                              Roles via Account Factory
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Super Admin Required</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">Your Account</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Edit User</h3>
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    disabled
                    value={editingUser.email}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Display Name</label>
                  <input
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Secure Password Change Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Change Your Password</h3>
                <button
                  onClick={() => setShowChangePassword(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <UserRemove size={20} />
                </button>
              </div>
              <SecurePasswordChange
                onPasswordChange={async (data) => {
                  try {
                    await adminApi.changePassword(data.currentPassword, data.newPassword);
                    success('Password Changed', 'Your password has been updated successfully');
                    setShowChangePassword(false);
                  } catch (error: any) {
                    showError('Password Change Failed', error.message);
                  }
                }}
                userRole={user?.isSuperAdmin ? 'super_admin' : 'admin'}
              />
            </div>
          </div>
        </div>
      )}

      {/* Emergency Password Reset Modal */}
      {showEmergencyReset && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Emergency Password Reset - {selectedUser.email}
              </h3>
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">
                  ⚠️ This is an emergency action that will be logged and audited. Only use in critical situations.
                </p>
              </div>
              <form onSubmit={handleEmergencyReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password</label>
                  <input
                    type="password"
                    required
                    value={emergencyResetForm.newPassword}
                    onChange={(e) => setEmergencyResetForm({ ...emergencyResetForm, newPassword: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                  <input
                    type="password"
                    required
                    value={emergencyResetForm.confirmPassword}
                    onChange={(e) => setEmergencyResetForm({ ...emergencyResetForm, confirmPassword: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmergencyReset(false);
                      setSelectedUser(null);
                      setEmergencyResetForm({ newPassword: '', confirmPassword: '' });
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Reset Password
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Security Dashboard Modal */}
      {showSecurityDashboard && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-6xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Security Dashboard</h3>
                <button
                  onClick={() => setShowSecurityDashboard(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <UserRemove size={20} />
                </button>
              </div>
              <SecurityDashboard />
            </div>
          </div>
        </div>
      )}
        </div>
      </PageContent>
    </>
  );
}
