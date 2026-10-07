import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE_NAME } from "../../../../server/auth";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await destroySession(token);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (err) {
    console.error("Logout error:", err);
    return NextResponse.json(
      { error: "Failed to log out", code: "internal_error" },
      { status: 500 },
    );
  }
}
