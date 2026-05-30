import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
    try {
        const { lineId, phone } = await request.json();

        if (!lineId || !phone) {
            return NextResponse.json(
                { error: 'Missing lineId or phone' },
                { status: 400 }
            );
        }

        // Normalize phone (remove non-digits)
        const normalizedPhone = phone.replace(/\D/g, '');

        // Check if user exists with this phone number
        const db = admin.firestore();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('phone', '==', normalizedPhone).limit(1).get();

        if (snapshot.empty) {
            return NextResponse.json(
                { error: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบ กรุณาติดต่อ admin' },
                { status: 404 }
            );
        }

        const userDoc = snapshot.docs[0];

        // Check if user already has a LINE ID linked
        const userData = userDoc.data();
        if (userData.lineId && userData.lineId !== lineId) {
            return NextResponse.json(
                { error: 'เบอร์โทรศัพท์นี้ถูกผูกกับบัญชี LINE อื่นแล้ว' },
                { status: 409 }
            );
        }

        // Update User with LINE ID
        await userDoc.ref.update({
            lineId: lineId,
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create Custom Token
        const uid = userDoc.id;
        const customToken = await admin.auth().createCustomToken(uid);

        return NextResponse.json({
            customToken,
            userProfile: {
                uid,
                ...userData,
                lineId // Return updated lineId
            }
        });

    } catch (error: any) {
        console.error('Link user error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}
