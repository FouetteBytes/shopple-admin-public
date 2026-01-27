/**
 * Bootstrap Admin Account
 * -------------------------------------------------
 * Grants admin and super admin claims to a Firebase user.
 * Usage: adjust `adminEmail` then run `node scripts/admin/setup-admin.js`.
 */

const admin = require('firebase-admin');
require('dotenv').config({ path: '../../.env' }); // Try to load .env from root

// Initialize Firebase Admin
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

// Configuration
const adminEmail = 'vogzokmelkor@gmail.com'; //  Update with the admin email that should receive elevated access

async function setupAdmin() {
  try {
    console.log(' Setting up admin user...');

    // Check if user exists
    let user;
    try {
      user = await admin.auth().getUserByEmail(adminEmail);
      console.log(`✅ Found existing user: ${adminEmail}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log(`❌ User not found: ${adminEmail}`);
        console.log('Please create this user in Firebase Console first:');
        console.log('1. Go to Firebase Console → Authentication → Users');
        console.log('2. Click "Add user"');
        console.log(`3. Add email: ${adminEmail}`);
        console.log('4. Set a password');
        console.log('5. Run this script again');
        return;
      }
      throw error;
    }

    // Set admin custom claim
    await admin.auth().setCustomUserClaims(user.uid, {
      admin: true,
      superAdmin: true, // Promote this user to manage other admins as well
    });
    console.log(` Admin and Super Admin privileges granted to ${adminEmail}`);

    // Verify the claim was set
    const userRecord = await admin.auth().getUser(user.uid);
    console.log(' User details:');
    console.log(`   - UID: ${userRecord.uid}`);
    console.log(`   - Email: ${userRecord.email}`);
    console.log(`   - Admin: ${userRecord.customClaims?.admin || false}`);
    console.log(`   - Super Admin: ${userRecord.customClaims?.superAdmin || false}`);

    console.log('\n Setup complete! You can now login to the admin dashboard.');
  } catch (error) {
    console.error('❌ Error setting up admin:', error.message);

    if (error.code === 'auth/invalid-email') {
      console.log('Please check the email format in this script.');
    } else if (error.message.includes('credential')) {
      console.log('\n Firebase Credentials Missing or Invalid:');
      console.log('Please ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set in your .env file.');
    }
  }

  process.exit();
}

setupAdmin();
