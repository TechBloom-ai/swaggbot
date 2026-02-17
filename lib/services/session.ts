import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { sessions, NewSession, Session, messages } from '@/lib/db/schema';
import { parseSwagger, extractBaseUrl, formatSwaggerForLLM } from '@/lib/utils/swagger';

export interface CreateSessionInput {
  name: string;
  swaggerUrl: string;
}

export interface UpdateSessionInput {
  name?: string;
  swaggerUrl?: string;
  authToken?: string | null;
  description?: string;
}

export interface SessionStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  lastAccessedAt: Date;
  createdAt: Date;
}

export class SessionService {
  async create(input: CreateSessionInput): Promise<Session> {
    // Fetch Swagger document from URL
    const response = await fetch(input.swaggerUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Swagger document: ${response.status} ${response.statusText}`
      );
    }

    const content = await response.text();

    // Parse Swagger document
    const swaggerDoc = parseSwagger(content);

    // Extract base URL
    const baseUrl = extractBaseUrl(swaggerDoc);

    // Create session
    const now = new Date();
    const newSession: NewSession = {
      id: crypto.randomUUID(),
      name: input.name,
      swaggerUrl: input.swaggerUrl,
      swaggerDoc: JSON.stringify(swaggerDoc),
      baseUrl,
      authToken: null,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(sessions).values(newSession);

    return newSession as Session;
  }

  async findAll(): Promise<Session[]> {
    return db.select().from(sessions).orderBy(sessions.createdAt);
  }

  async findById(id: string): Promise<Session | null> {
    const results = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return results[0] || null;
  }

  async updateAuthToken(id: string, authToken: string | null): Promise<Session> {
    const now = new Date();

    await db
      .update(sessions)
      .set({
        authToken,
        updatedAt: now,
        lastAccessedAt: now,
      })
      .where(eq(sessions.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Session not found');
    }

    return updated;
  }

  async updateLastAccessed(id: string): Promise<void> {
    await db
      .update(sessions)
      .set({
        lastAccessedAt: new Date(),
      })
      .where(eq(sessions.id, id));
  }

  async update(id: string, input: UpdateSessionInput): Promise<Session> {
    const now = new Date();
    const updateData: Partial<typeof sessions.$inferInsert> = {
      updatedAt: now,
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    if (input.swaggerUrl !== undefined) {
      // If swagger URL changed, fetch and parse new document
      const response = await fetch(input.swaggerUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch Swagger document: ${response.status} ${response.statusText}`
        );
      }
      const content = await response.text();
      const swaggerDoc = parseSwagger(content);
      const baseUrl = extractBaseUrl(swaggerDoc);

      updateData.swaggerUrl = input.swaggerUrl;
      updateData.swaggerDoc = JSON.stringify(swaggerDoc);
      updateData.baseUrl = baseUrl;
    }

    if (input.authToken !== undefined) {
      updateData.authToken = input.authToken;
    }

    await db.update(sessions).set(updateData).where(eq(sessions.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Session not found');
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  async getStats(id: string): Promise<SessionStats | null> {
    const session = await this.findById(id);
    if (!session) {
      return null;
    }

    const messageCounts = await db
      .select({
        count: sql<number>`count(*)`,
        role: messages.role,
      })
      .from(messages)
      .where(eq(messages.sessionId, id))
      .groupBy(messages.role);

    const userMessages = messageCounts.find(m => m.role === 'user')?.count || 0;
    const assistantMessages = messageCounts.find(m => m.role === 'assistant')?.count || 0;

    return {
      totalMessages: userMessages + assistantMessages,
      userMessages,
      assistantMessages,
      lastAccessedAt: session.lastAccessedAt,
      createdAt: session.createdAt,
    };
  }

  getFormattedSwagger(session: Session): string {
    const doc = JSON.parse(session.swaggerDoc) as Record<string, unknown>;
    return formatSwaggerForLLM(doc as unknown as Parameters<typeof formatSwaggerForLLM>[0]);
  }

  getSwaggerDoc(session: Session): Record<string, unknown> {
    return JSON.parse(session.swaggerDoc);
  }
}

// Singleton instance
export const sessionService = new SessionService();
