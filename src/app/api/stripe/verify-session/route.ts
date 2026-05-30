import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export async function POST(req: Request) {
    try {
        const { session_id, orderId } = await req.json();

        if (!session_id || !orderId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const settingsRef = doc(db, 'settings', 'store');
        const settingsSnap = await getDoc(settingsRef);

        if (!settingsSnap.exists()) {
            return NextResponse.json({ error: 'Store settings not found' }, { status: 500 });
        }

        const settingsData = settingsSnap.data();

        if (!settingsData.enableStripe || !settingsData.stripeSecretKey) {
            return NextResponse.json({ error: 'Stripe is not configured or enabled on this store' }, { status: 400 });
        }

        const stripe = new Stripe(settingsData.stripeSecretKey);

        // Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
            // Update the order in Firestore
            const orderRef = doc(db, 'orders', orderId);

            await updateDoc(orderRef, {
                status: 'paid', // Or whatever your successful status is, maybe 'processing' or 'completed'
                paymentMethod: 'stripe',
                paymentStatus: 'paid',
                stripeSessionId: session_id,
                stripePaymentIntentId: session.payment_intent,
                updatedAt: serverTimestamp(),
            });

            return NextResponse.json({ success: true, payment_status: 'paid' });
        } else {
            return NextResponse.json({ success: true, payment_status: session.payment_status });
        }

    } catch (error: any) {
        console.error('Error verifying Stripe session:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
