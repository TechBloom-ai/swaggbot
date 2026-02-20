import { NextRequest, NextResponse } from 'next/server';

import { createSession, verifyPassword } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ success: false, error: 'Password is required' }, { status: 400 });
    }

    // Verify password
    const isValid = verifyPassword(password);

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
    }

    // Create session
    const sessionToken = await createSession();

    // Set cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: 'session',
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400', 10),
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
