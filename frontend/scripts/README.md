# Frontend Utility Scripts

Organized automation and maintenance scripts that support the admin dashboard.

## Structure

- `admin/` – Firebase administration helpers for bootstrapping privileged users.

## Available Scripts

- `admin/list-users.js` – Lists the first batch of Firebase users and prints their admin claims.
- `admin/setup-admin.js` – Grants admin and super admin claims to an existing Firebase Auth user.
- `admin/setup-super-admin.js` – Interactive wizard to create or elevate a super admin account using environment credentials.

> Run any script from the frontend root, e.g. `node scripts/admin/list-users.js`.
