import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { UserRole } from "@/types/user";

export async function POST(req: NextRequest) {
    if (!admin.apps.length) {
        return NextResponse.json({ error: "Firebase Admin not initialized" }, { status: 500 });
    }

    try {
        const body = await req.json();
        const { email, password, name, role, phone, lineId, address } = body;

        // 1. Create User in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        // 2. Set Custom Claims for Role
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });

        // 3. Create User Document in Firestore
        const userDoc = {
            uid: userRecord.uid,
            email,
            displayName: name,
            name,
            role: role as UserRole,
            phone,
            lineId,
            address,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            points: 0,
            provider: 'password'
        };

        await admin.firestore().collection('users').doc(userRecord.uid).set(userDoc);

        return NextResponse.json({ success: true, uid: userRecord.uid });

    } catch (error: any) {
        console.error("Error creating user:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function PUT(req: NextRequest) {
    if (!admin.apps.length) {
        return NextResponse.json({ error: "Firebase Admin not initialized" }, { status: 500 });
    }

    try {
        const body = await req.json();
        const { uid, email, password, name, role, phone, lineId, address } = body;

        if (!uid) {
            return NextResponse.json({ error: "UID is required" }, { status: 400 });
        }

        // 1. Update Auth Profile (Email, Password, Name)
        const authUpdates: any = {};
        if (email) authUpdates.email = email;
        if (password && password.length >= 6) authUpdates.password = password;
        if (name) authUpdates.displayName = name;

        // Only update Auth if there are changes
        if (Object.keys(authUpdates).length > 0) {
            await admin.auth().updateUser(uid, authUpdates);
        }

        // 2. Set Custom Claims if role changed
        if (role) {
            await admin.auth().setCustomUserClaims(uid, { role });
        }

        // 3. Update Firestore Document
        const firestoreUpdates: any = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (email) firestoreUpdates.email = email;
        if (name) {
            firestoreUpdates.displayName = name;
            firestoreUpdates.name = name;
        }
        if (role) firestoreUpdates.role = role;
        if (phone !== undefined) firestoreUpdates.phone = phone;
        if (lineId !== undefined) firestoreUpdates.lineId = lineId;
        if (address !== undefined) firestoreUpdates.address = address;

        await admin.firestore().collection('users').doc(uid).update(firestoreUpdates);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error updating user:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest) {
    if (!admin.apps.length) {
        return NextResponse.json({ error: "Firebase Admin not initialized" }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const uid = searchParams.get('uid');

        if (!uid) {
            return NextResponse.json({ error: "UID is required" }, { status: 400 });
        }

        // 1. Delete from Auth
        await admin.auth().deleteUser(uid);

        // 2. Delete from Firestore
        await admin.firestore().collection('users').doc(uid).delete();

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error deleting user:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
