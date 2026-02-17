import { eq, desc, and } from 'drizzle-orm';

import { db } from '@/lib/db';
import { messages, Message, NewMessage } from '@/lib/db/schema';

export class MessageService {
  private static instance: MessageService;

  private constructor() {}

  public static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  /**
   * Get recent messages for a session
   * @param sessionId - The session ID
   * @param limit - Maximum number of messages to return (default: 10)
   * @returns Array of messages ordered by creation time (oldest first)
   */
  async getRecentMessages(sessionId: string, limit: number = 10): Promise<Message[]> {
    try {
      const result = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      // Return in chronological order (oldest first)
      return result.reverse();
    } catch (error) {
      console.error('[MessageService] Failed to get recent messages:', error);
      throw new Error('Failed to load chat history. Please try again.');
    }
  }

  /**
   * Create a new message
   * @param data - Message data
   * @returns The created message with ID
   */
  async create(data: Omit<NewMessage, 'id' | 'createdAt'>): Promise<Message> {
    const id = crypto.randomUUID();
    const createdAt = new Date();

    // Apply content limit (10,000 characters max)
    const content =
      data.content.length > 10000
        ? data.content.substring(0, 10000) + '\n[Message truncated due to length]'
        : data.content;

    try {
      await db.insert(messages).values({
        id,
        sessionId: data.sessionId,
        role: data.role,
        content,
        workflowId: data.workflowId || null,
        metadata: data.metadata || null,
        createdAt,
      });

      return {
        id,
        sessionId: data.sessionId,
        role: data.role,
        content,
        workflowId: data.workflowId || null,
        metadata: data.metadata || null,
        createdAt,
      };
    } catch (error) {
      console.error('[MessageService] Failed to create message:', error);
      throw new Error('Failed to save message. Please try again.');
    }
  }

  /**
   * Get a message by ID
   * @param id - Message ID
   * @returns Message or null if not found
   */
  async getById(id: string): Promise<Message | null> {
    try {
      const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('[MessageService] Failed to get message by ID:', error);
      throw new Error('Failed to retrieve message. Please try again.');
    }
  }

  /**
   * Get messages by workflow ID
   * @param workflowId - Workflow ID
   * @returns Array of messages linked to the workflow
   */
  async getByWorkflowId(workflowId: string): Promise<Message[]> {
    try {
      const result = await db
        .select()
        .from(messages)
        .where(eq(messages.workflowId, workflowId))
        .orderBy(desc(messages.createdAt));

      return result;
    } catch (error) {
      console.error('[MessageService] Failed to get messages by workflow ID:', error);
      throw new Error('Failed to retrieve workflow messages. Please try again.');
    }
  }

  /**
   * Find the most recent message containing a workflow reference
   * Searches for messages with workflow metadata
   * @param sessionId - Session ID
   * @param limit - How many recent messages to search
   * @returns The most recent message with a workflow, or null
   */
  async findRecentWorkflowMessage(sessionId: string, limit: number = 10): Promise<Message | null> {
    try {
      const result = await db
        .select()
        .from(messages)
        .where(and(eq(messages.sessionId, sessionId), eq(messages.role, 'assistant')))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      // Find the first message with workflow metadata
      for (const message of result) {
        if (message.metadata) {
          try {
            const metadata = JSON.parse(message.metadata);
            if (metadata.workflowId || metadata.type === 'workflow') {
              return message;
            }
          } catch {
            // Invalid JSON, skip
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[MessageService] Failed to find recent workflow message:', error);
      return null;
    }
  }

  /**
   * Delete all messages for a session
   * @param sessionId - Session ID
   */
  async deleteBySessionId(sessionId: string): Promise<void> {
    try {
      await db.delete(messages).where(eq(messages.sessionId, sessionId));
    } catch (error) {
      console.error('[MessageService] Failed to delete messages:', error);
      throw new Error('Failed to delete chat history. Please try again.');
    }
  }
}

// Export singleton instance
export const messageService = MessageService.getInstance();
