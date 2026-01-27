import AdminAccountFactory from '@/components/auth/AdminAccountFactory';

export default function AdminAccountsPage() {
  return <AdminAccountFactory />;
}

export const metadata = {
  title: 'Admin Account Factory',
  description: 'Provision dedicated admin and super admin accounts with forced password reset policies.',
};
