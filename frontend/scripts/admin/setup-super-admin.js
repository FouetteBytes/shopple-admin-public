/**
 * Interactive Super Admin Bootstrapper
 * --------------------------------------------------
 * Prompts for credentials and assigns admin + superAdmin claims.
 * Usage: ensure Firebase Admin env vars are set, then run `node scripts/admin/setup-super-admin.js`.
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function setupSuperAdmin() {
  try {
    console.log('\n Setting up Super Admin Account');
    console.log('=====================================\n');

    // Get user email
    const email = await new Promise((resolve) => {
      rl.question('Enter the super admin email address: ', (answer) => {
        resolve(answer.trim());
      });
    });

    if (!email || !email.includes('@')) {
      console.log(' Invalid email address');
      process.exit(1);
    }

    console.log(`\n Looking up user with email: ${email}`);

    // Find user by email
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      console.log(` Found existing user: ${userRecord.uid}`);
    } catch (error) {
      console.log(' User not found. Creating new user...');

      // Get password for new user
      const password = await new Promise((resolve) => {
        rl.question('Enter password for new super admin (min 6 characters): ', (answer) => {
          resolve(answer.trim());
        });
      });

      if (!password || password.length < 6) {
        console.log(' Password must be at least 6 characters long');
        process.exit(1);
      }

      // Create new user
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: 'Super Admin',
        emailVerified: true,
      });
      console.log(` Created new user: ${userRecord.uid}`);
    }

    // Set super admin custom claims
    const customClaims = {
      admin: true,
      superAdmin: true,
    };

    await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);
    console.log(' Super admin claims set successfully');

    // Verify claims
    const user = await admin.auth().getUser(userRecord.uid);
    console.log('\n User Claims:', user.customClaims);

    console.log('\n Super admin setup complete!');
    console.log(`\nYou can now login with:`);
    console.log(`Email: ${email}`);
    console.log('Roles: Super Admin, Admin');
  } catch (error) {
    console.error(' Error setting up super admin:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Check environment variables
if (
  !process.env.FIREBASE_PROJECT_ID ||
  !process.env.FIREBASE_CLIENT_EMAIL ||
  !process.env.FIREBASE_PRIVATE_KEY
) {
  console.log(' Missing Firebase Admin SDK environment variables.');
  console.log('Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

setupSuperAdmin();
