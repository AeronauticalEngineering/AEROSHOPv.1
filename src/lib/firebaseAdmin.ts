import admin from 'firebase-admin';

// ตรวจสอบว่ามี credentials หรือไม่
const hasCredentials =
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PROJECT_ID;

if (!admin.apps.length && hasCredentials) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Replace escaped newlines for certain environments
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
            })
        });
    } catch (error) {
        console.error('Firebase Admin initialization error:', error);
    }
}

// Helper function สำหรับตรวจสอบว่า Firebase Admin พร้อมใช้งานหรือไม่
function isFirebaseAdminReady(): boolean {
    return admin.apps.length > 0;
}

export { isFirebaseAdminReady };
export default admin;
