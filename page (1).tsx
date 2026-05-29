const admin = require("firebase-admin");
const dotenv = require("dotenv");
const path = require("path");

// Load .env.local
dotenv.config({ path: path.join(__dirname, "../.env.local") });

// Check credentials
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error("❌ Error: Missing FIREBASE_PROJECT_ID or FIREBASE_PRIVATE_KEY in .env.local");
    process.exit(1);
}

// Initialize Firebase Admin
try {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
    });
} catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
    process.exit(1);
}

const db = admin.firestore();

async function createUser() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log("Usage: node scripts/create-user.js <phone> <role> <displayName>");
        console.log("Example: node scripts/create-user.js 0812345678 admin 'Suppachai Admin'");
        process.exit(1);
    }

    const [phone, role, displayName] = args;
    const normalizedPhone = phone.replace(/\D/g, '');

    if (!['admin', 'employee', 'customer'].includes(role)) {
        console.error("❌ Error: Role must be one of: admin, employee, customer");
        process.exit(1);
    }

    console.log(`Creating user... Phone: ${normalizedPhone}, Role: ${role}, Name: ${displayName}`);

    try {
        // Check if phone exists
        const snapshot = await db.collection('users').where('phone', '==', normalizedPhone).get();

        let uid;
        let msg;

        if (!snapshot.empty) {
            console.log("⚠️ User with this phone already exists. Updating role and name...");
            const doc = snapshot.docs[0];
            uid = doc.id;
            await doc.ref.update({
                role,
                displayName,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            msg = "Updated";
        } else {
            // Create new
            const userRecord = await admin.auth().createUser({
                phoneNumber: `+66${normalizedPhone.substring(1)}`, // Simple TH format assume 08x
                displayName: displayName
            });
            uid = userRecord.uid;

            await db.collection('users').doc(uid).set({
                uid,
                phone: normalizedPhone,
                role,
                displayName,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            });
            msg = "Created";
        }

        console.log(`✅ User ${msg} Successfully!`);
        console.log(`UID: ${uid}`);
        console.log(`Phone: ${normalizedPhone}`);
        console.log(`Role: ${role}`);

    } catch (error) {
        console.error("❌ Error:", error);
    }
}

createUser();
