/**
 * List Firebase Users
 * ----------------------------------------------
 * Utility script to list project users with their admin flags.
 * Usage: `node scripts/admin/list-users.js`
 */

const admin = require('firebase-admin');
require('dotenv').config({ path: '../../.env' }); // Try to load .env from root

// Initialize Firebase Admin SDK
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error(' Missing Firebase credentials in environment variables.');
  console.error('Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  }),
});

async function listUsers() {
  try {
    console.log(' Listing all users...');

    const listUsersResult = await admin.auth().listUsers(10);

    if (listUsersResult.users.length === 0) {
      console.log(' No users found in the project');
      return;
    }

    console.log(`✅ Found ${listUsersResult.users.length} users:`);
    listUsersResult.users.forEach((userRecord, index) => {
      console.log(`\n${index + 1}. User:`);
      console.log(`   - UID: ${userRecord.uid}`);
      console.log(`   - Email: ${userRecord.email || 'No email'}`);
      console.log(`   - Created: ${userRecord.metadata.creationTime}`);
      console.log(`   - Admin: ${userRecord.customClaims?.admin || false}`);
    });
  } catch (error) {
    console.error(' Error listing users:', error.message);
  }

  process.exit();
}

listUsers();
