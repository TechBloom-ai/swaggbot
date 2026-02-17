import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sessionService } from '@/lib/services/session';

const updateSessionSchema = z.object({
  authToken: z.string().nullable().optional(),
});

// GET /api/session/[id] - Get session details
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await sessionService.findById(id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Failed to get session:', error);
    return NextResponse.json({ error: 'Failed to get session' }, { status: 500 });
  }
}

// PATCH /api/session/[id] - Update session (e.g., auth token)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validation = updateSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Check if session exists
    const existingSession = await sessionService.findById(id);
    if (!existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Update auth token if provided
    if (validation.data.authToken !== undefined) {
      const session = await sessionService.updateAuthToken(id, validation.data.authToken);
      return NextResponse.json({ session });
    }

    return NextResponse.json({ session: existingSession });
  } catch (error) {
    console.error('Failed to update session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update session' },
      { status: 500 }
    );
  }
}

// DELETE /api/session/[id] - Delete session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if session exists
    const existingSession = await sessionService.findById(id);
    if (!existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await sessionService.delete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete session:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
