import { NextResponse } from "next/server";
import { getSessionFromCookies } from "../../../../server/auth";

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ authenticated: false, user: null, business: null });
    }

    return NextResponse.json({
      authenticated: true,
      user: session.user,
      business: session.business,
    });
  } catch (err) {
    console.error("Auth check error:", err);
    return NextResponse.json(
      { authenticated: false, error: "Failed to verify session" },
      { status: 500 },
    );
  }
}
