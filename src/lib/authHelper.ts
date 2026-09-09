import admin from "@/lib/firebaseAdmin";

export interface AuthCheckResult {
  authorized: boolean;
  uid?: string;
  role?: string;
  error?: string;
}

/**
 * Verifies if the incoming request has a valid Bearer token belonging to an admin or employee.
 */
export async function verifyAdminRequest(req: Request, allowEmployee: boolean = false): Promise<AuthCheckResult> {
  const isDev = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_MOCK_LIFF === "true";
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (isDev) {
        return { authorized: true, uid: "dev_user_admin", role: "admin" };
      }
      return { authorized: false, error: "Missing authorization token" };
    }

    const token = authHeader.split("Bearer ")[1]?.trim();
    if (!token) {
      if (isDev) {
        return { authorized: true, uid: "dev_user_admin", role: "admin" };
      }
      return { authorized: false, error: "Empty authorization token" };
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const customRole = decoded.role as string | undefined;

      if (customRole === "admin" || (allowEmployee && customRole === "employee")) {
        return { authorized: true, uid: decoded.uid, role: customRole };
      }

      // Fallback: Check Firestore users collection
      const userSnap = await admin.firestore().doc(`users/${decoded.uid}`).get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        const userRole = userData.role as string | undefined;
        if (userRole === "admin" || (allowEmployee && userRole === "employee")) {
          return { authorized: true, uid: decoded.uid, role: userRole };
        }
      }

      if (isDev) {
        return { authorized: true, uid: decoded.uid || "dev_user_admin", role: "admin" };
      }

      return { authorized: false, error: "Forbidden: Insufficient privileges" };
    } catch (tokenErr) {
      // In development mode, if token verification fails due to audience mismatch between projects
      if (isDev) {
        console.warn("verifyAdminRequest dev bypass after token error:", tokenErr);
        return { authorized: true, uid: "dev_user_admin", role: "admin" };
      }
      throw tokenErr;
    }
  } catch (error) {
    if (isDev) {
      return { authorized: true, uid: "dev_user_admin", role: "admin" };
    }
    const message = error instanceof Error ? error.message : "Token verification failed";
    return { authorized: false, error: message };
  }
}
