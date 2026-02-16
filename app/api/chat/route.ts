import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chatService } from '@/lib/services/chat';

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

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
