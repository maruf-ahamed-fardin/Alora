import { NextResponse } from "next/server";
import { AuthError, SESSION_COOKIE_NAME, SESSION_MAX_AGE_DAYS, signUp } from "../../../../server/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await signUp(body);

    const response = NextResponse.json({
      success: true,
      user: result.user,
      business: result.business,
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Failed to sign up", code: "internal_error" },
      { status: 500 },
    );
  }
}
