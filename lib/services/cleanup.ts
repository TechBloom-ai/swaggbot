import { sql } from 'drizzle-orm';

import { db, getDbClient } from '@/lib/db';
import { sessions, workflows, messages } from '@/lib/db/schema';
import { log } from '@/lib/logger';

export interface CleanupResult {
  success: boolean;
  deletedSessions?: number;
  deletedWorkflows?: number;
  deletedMessages?: number;
  error?: string;
}

export interface DatabaseStats {
  sessionsCount: number;
  workflowsCount: number;
  messagesCount: number;
  databaseSize: number;
}

export class CleanupService {
  private readonly SESSION_RETENTION_DAYS = 30;
  private readonly WORKFLOW_RETENTION_DAYS = 7;

  /**
   * Get database statistics
   */
  async getStats(): Promise<DatabaseStats> {
    const sessionsResult = await db.select({ count: sql<number>`count(*)` }).from(sessions);
    const workflowsResult = await db.select({ count: sql<number>`count(*)` }).from(workflows);
    const messagesResult = await db.select({ count: sql<number>`count(*)` }).from(messages);

    // Get database file size (SQLite specific)
    let databaseSize = 0;
    try {
      const client = getDbClient();
      const sizeResult = await client.execute(
        'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()'
      );
      databaseSize = (sizeResult.rows[0]?.size as number) || 0;
    } catch {
      // Fallback if pragma doesn't work
      databaseSize = 0;
    }

    return {
      sessionsCount: sessionsResult[0]?.count || 0,
      workflowsCount: workflowsResult[0]?.count || 0,
      messagesCount: messagesResult[0]?.count || 0,
      databaseSize,
    };
  }

  /**
   * Clean up old sessions (inactive for more than 30 days)
   */
  async cleanupSessions(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.SESSION_RETENTION_DAYS);

    try {
      const result = await db
        .delete(sessions)
        .where(sql`${sessions.lastAccessedAt} < ${cutoffDate.toISOString()}`)
        .returning({ id: sessions.id });

      const deletedCount = Array.isArray(result) ? result.length : 0;
      log.info('Cleaned up old sessions', { deletedCount, cutoffDate });
      return deletedCount;
    } catch (error) {
      log.error('Failed to cleanup sessions', error);
      throw error;
    }
  }

  /**
   * Clean up old workflows (completed/failed for more than 7 days)
   */
  async cleanupWorkflows(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.WORKFLOW_RETENTION_DAYS);

    try {
      const result = await db
        .delete(workflows)
        .where(
          sql`(${workflows.status} = 'completed' OR ${workflows.status} = 'failed') AND ${workflows.completedAt} < ${cutoffDate.toISOString()}`
        )
        .returning({ id: workflows.id });

      const deletedCount = Array.isArray(result) ? result.length : 0;
      log.info('Cleaned up old workflows', { deletedCount, cutoffDate });
      return deletedCount;
    } catch (error) {
      log.error('Failed to cleanup workflows', error);
      throw error;
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  async vacuumDatabase(): Promise<void> {
    try {
      const client = getDbClient();
      await client.execute('VACUUM');
      log.info('Database vacuumed successfully');
    } catch (error) {
      log.error('Failed to vacuum database', error);
      throw error;
    }
  }

  /**
   * Run full cleanup
   */
  async runFullCleanup(): Promise<CleanupResult> {
    try {
      // Get stats BEFORE any deletions (important: cascade deletes happen during cleanup)
      const beforeStats = await this.getStats();

      const deletedSessions = await this.cleanupSessions();
      const deletedWorkflows = await this.cleanupWorkflows();

      // Get stats AFTER deletions to calculate cascade-deleted messages
      const afterStats = await this.getStats();
      await this.vacuumDatabase();

      const deletedMessages = Math.max(0, beforeStats.messagesCount - afterStats.messagesCount);

      return {
        success: true,
        deletedSessions,
        deletedWorkflows,
        deletedMessages,
      };
    } catch (error) {
      log.error('Full cleanup failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
export const cleanupService = new CleanupService();
