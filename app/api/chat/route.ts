import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chatService } from '@/lib/services/chat';
import { messageService } from '@/lib/services/message';

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

// GET /api/chat - Get message history for a session
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidSchema = z.string().uuid();
    const validation = uuidSchema.safeParse(sessionId);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    // Get recent messages
    const messages = await messageService.getRecentMessages(sessionId, 50);

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Failed to get message history:', error);
    return NextResponse.json(
      {
        error: 'Failed to load chat history',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/chat - Send a message and get response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = chatSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionId, message } = validation.data;

    // Process message
    const response = await chatService.processMessage({ sessionId, message });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to process chat message:', error);
    return NextResponse.json(
      {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to process message'
      },
      { status: 500 }
    );
  }
}
