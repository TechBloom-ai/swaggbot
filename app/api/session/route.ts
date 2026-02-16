import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionService } from '@/lib/services/session';

const createSessionSchema = z.object({
  name: z.string().min(1).max(100),
  swaggerUrl: z.string().url(),
});

// GET /api/session - List all sessions
export async function GET() {
  try {
    const sessions = await sessionService.findAll();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Failed to list sessions:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}

// POST /api/session - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = createSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      );
    }
    
    const session = await sessionService.create(validation.data);
    
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
