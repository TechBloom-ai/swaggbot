import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { sessions, NewSession, Session, messages } from '@/lib/db/schema';
import { SwaggerDoc } from '@/lib/types';
import { parseSwagger, extractBaseUrl, formatSwaggerForLLM } from '@/lib/utils/swagger';
import { validateSwaggerUrlFull } from '@/lib/utils/url-validator';

/**
 * Extract the origin (protocol + host) from a URL
 * e.g., "http://192.168.1.8:3000/swagger.json" -> "http://192.168.1.8:3000"
 */
function extractOriginFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    return null;
  }
}

/**
 * Derive base URL by combining origin from Swagger URL with path from Swagger document's servers
 * This ensures the correct API base path is used even when the swagger.json is served from a different path
 *
 * Example:
 * - swaggerUrl: "http://192.168.1.8:3000/swagger.json"
 * - swaggerDoc.servers[0].url: "http://localhost:3000/api/v1"
 * - Result: "http://192.168.1.8:3000/api/v1"
 */
function deriveBaseUrl(swaggerUrl: string, swaggerDoc: SwaggerDoc): string | null {
  // Extract origin from the Swagger URL (protocol + host)
  const urlOrigin = extractOriginFromUrl(swaggerUrl);
  if (!urlOrigin) {
    return extractBaseUrl(swaggerDoc);
  }

  // Extract path from Swagger document's servers
  const swaggerDocBaseUrl = extractBaseUrl(swaggerDoc);
  if (swaggerDocBaseUrl) {
    try {
      const docUrl = new URL(swaggerDocBaseUrl);
      // Combine origin from swaggerUrl with pathname from swaggerDoc
      // Remove trailing slash to avoid double slashes when appending endpoints
      return `${urlOrigin}${docUrl.pathname}`.replace(/\/+$/, '');
    } catch {
      // If swaggerDocBaseUrl is relative (e.g., "/api/v1")
      return `${urlOrigin}${swaggerDocBaseUrl}`.replace(/\/+$/, '');
    }
  }

  return urlOrigin;
}

/**
 * When running inside Docker, rewrite localhost/127.0.0.1 URLs to host.docker.internal
 * so fetch/curl can reach services running on the host machine.
 */
function rewriteLocalhostForDocker(url: string): string {
  if (process.env.RUNNING_IN_DOCKER !== 'true') {
    return url;
  }

  return url
    .replace(/http:\/\/localhost/g, 'http://host.docker.internal')
    .replace(/https:\/\/localhost/g, 'https://host.docker.internal')
    .replace(/http:\/\/127\.0\.0\.1/g, 'http://host.docker.internal')
    .replace(/https:\/\/127\.0\.0\.1/g, 'https://host.docker.internal');
}

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
    // Validate URL security (defense-in-depth: also validated at API layer)
    const urlValidation = validateSwaggerUrlFull(input.swaggerUrl);
    if (!urlValidation.valid) {
      throw new Error(`Invalid Swagger URL: ${urlValidation.error}`);
    }

    // Fetch Swagger document from URL (rewrite localhost when inside Docker)
    const fetchUrl = rewriteLocalhostForDocker(input.swaggerUrl);
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Swagger document: ${response.status} ${response.statusText}`
      );
    }

    const content = await response.text();

    // Parse Swagger document
    const swaggerDoc = parseSwagger(content);

    // Derive base URL from Swagger URL origin (priority) with fallback to Swagger doc
    // Rewrite localhost for Docker so curl commands target the host machine
    const baseUrl = rewriteLocalhostForDocker(deriveBaseUrl(input.swaggerUrl, swaggerDoc) || '');

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
      // Derive base URL from Swagger URL origin (priority) with fallback to Swagger doc
      const baseUrl = deriveBaseUrl(input.swaggerUrl, swaggerDoc);

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
    // Pass the session's derived baseUrl to ensure LLM uses the correct URL
    // This is crucial for Docker scenarios where we need to use the host IP instead of localhost
    return formatSwaggerForLLM(
      doc as unknown as Parameters<typeof formatSwaggerForLLM>[0],
      session.baseUrl ?? undefined
    );
  }

  getSwaggerDoc(session: Session): Record<string, unknown> {
    return JSON.parse(session.swaggerDoc);
  }
}

// Singleton instance
export const sessionService = new SessionService();
