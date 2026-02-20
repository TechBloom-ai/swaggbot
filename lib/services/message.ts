import { eq, desc, and, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { messages, Message, NewMessage } from '@/lib/db/schema';
import { log } from '@/lib/logger';

export interface CursorPaginatedMessages {
  messages: Message[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

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
   * Get recent messages for a session with cursor-based pagination
   * @param sessionId - The session ID
   * @param cursor - Optional cursor (message ID) to fetch messages before this point
   * @param limit - Maximum number of messages to return (default: 50)
   * @returns Paginated messages ordered by creation time (oldest first)
   */
  async getRecentMessages(
    sessionId: string,
    cursor?: string,
    limit: number = 50
  ): Promise<CursorPaginatedMessages> {
    try {
      // Apply cursor if provided
      let cursorCreatedAt: Date | null = null;
      if (cursor) {
        const cursorMessage = await this.getById(cursor);
        if (cursorMessage) {
          cursorCreatedAt = cursorMessage.createdAt;
        }
      }

      // Fetch messages with pagination
      const results = await db
        .select()
        .from(messages)
        .where(
          cursorCreatedAt
            ? sql`${messages.sessionId} = ${sessionId} AND ${messages.createdAt} <= ${cursorCreatedAt.getTime()}`
            : eq(messages.sessionId, sessionId)
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit + 1); // Fetch one extra to check for next page

      // Check if there's more data
      const hasMore = results.length > limit;
      const messageList = hasMore ? results.slice(0, -1) : results;

      // Get the next cursor (last item's ID)
      const nextCursor =
        hasMore && messageList.length > 0 ? messageList[messageList.length - 1].id : null;

      // Return in chronological order (oldest first)
      return {
        messages: messageList.reverse(),
        pagination: {
          cursor: nextCursor,
          hasMore,
          limit,
        },
      };
    } catch (error) {
      log.error('Failed to get recent messages', error, {
        sessionId,
        operation: 'get_recent_messages',
      });
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
      log.error('Failed to create message', error, {
        sessionId: data.sessionId,
        operation: 'create_message',
      });
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
      log.error('Failed to get message by ID', error, {
        messageId: id,
        operation: 'get_message_by_id',
      });
      throw new Error('Failed to retrieve message. Please try again.');
    }
  }

  /**
   * Get messages by workflow ID with cursor-based pagination
   * @param workflowId - Workflow ID
   * @param cursor - Optional cursor (message ID) to fetch messages before this point
   * @param limit - Maximum number of messages to return (default: 50)
   * @returns Paginated messages linked to the workflow
   */
  async getByWorkflowId(
    workflowId: string,
    cursor?: string,
    limit: number = 50
  ): Promise<CursorPaginatedMessages> {
    try {
      // Apply cursor if provided
      let cursorCreatedAt: Date | null = null;
      if (cursor) {
        const cursorMessage = await this.getById(cursor);
        if (cursorMessage) {
          cursorCreatedAt = cursorMessage.createdAt;
        }
      }

      // Fetch messages with pagination
      const results = await db
        .select()
        .from(messages)
        .where(
          cursorCreatedAt
            ? sql`${messages.workflowId} = ${workflowId} AND ${messages.createdAt} <= ${cursorCreatedAt.getTime()}`
            : eq(messages.workflowId, workflowId)
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit + 1); // Fetch one extra to check for next page

      // Check if there's more data
      const hasMore = results.length > limit;
      const messageList = hasMore ? results.slice(0, -1) : results;

      // Get the next cursor (last item's ID)
      const nextCursor =
        hasMore && messageList.length > 0 ? messageList[messageList.length - 1].id : null;

      return {
        messages: messageList,
        pagination: {
          cursor: nextCursor,
          hasMore,
          limit,
        },
      };
    } catch (error) {
      log.error('Failed to get messages by workflow ID', error, {
        workflowId,
        operation: 'get_messages_by_workflow',
      });
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
      log.error('Failed to find recent workflow message', error, {
        sessionId,
        operation: 'find_workflow_message',
      });
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
      log.error('Failed to delete messages', error, { sessionId, operation: 'delete_messages' });
      throw new Error('Failed to delete chat history. Please try again.');
    }
  }
}

// Export singleton instance
export const messageService = MessageService.getInstance();
