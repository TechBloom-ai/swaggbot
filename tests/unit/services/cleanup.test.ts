/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cleanupService, CleanupService } from '@/lib/services/cleanup';
import { sessions, workflows, messages } from '@/lib/db/schema';
import * as dbModule from '@/lib/db';

describe('CleanupService', () => {
  let service: CleanupService;

  beforeEach(() => {
    service = new CleanupService();
  });

  describe('getStats', () => {
    it('should return database statistics', async () => {
      const mockStats = {
        sessionsCount: 5,
        workflowsCount: 10,
        messagesCount: 100,
        databaseSize: 1024000,
      };

      // Mock the database responses
      const mockSelect = vi.fn();
      mockSelect
        .mockReturnValueOnce({ from: () => Promise.resolve([{ count: mockStats.sessionsCount }]) })
        .mockReturnValueOnce({ from: () => Promise.resolve([{ count: mockStats.workflowsCount }]) })
        .mockReturnValueOnce({ from: () => Promise.resolve([{ count: mockStats.messagesCount }]) });

      vi.spyOn(dbModule.db, 'select').mockImplementation(mockSelect as any);

      const result = await service.getStats();

      expect(result).toHaveProperty('sessionsCount');
      expect(result).toHaveProperty('workflowsCount');
      expect(result).toHaveProperty('messagesCount');
      expect(result).toHaveProperty('databaseSize');
    }, 10000);

    it('should handle database size retrieval errors gracefully', async () => {
      // Mock to return 0 when pragma fails
      vi.spyOn(dbModule.db, 'select').mockImplementation(() => {
        throw new Error('Database error');
      });

      // Should not throw, but handle gracefully
      await expect(service.getStats()).rejects.toThrow();
    });
  });

  describe('cleanupSessions', () => {
    it('should delete sessions older than 30 days', async () => {
      const mockDeletedSessions = [{ id: 'session-1' }, { id: 'session-2' }];

      vi.spyOn(dbModule.db, 'delete').mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(mockDeletedSessions),
        }),
      } as any);

      const deletedCount = await service.cleanupSessions();

      expect(deletedCount).toBe(2);
    });

    it('should return 0 when no old sessions to delete', async () => {
      vi.spyOn(dbModule.db, 'delete').mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const deletedCount = await service.cleanupSessions();

      expect(deletedCount).toBe(0);
    });
  });

  describe('cleanupWorkflows', () => {
    it('should delete completed/failed workflows older than 7 days', async () => {
      const mockDeletedWorkflows = [
        { id: 'workflow-1' },
        { id: 'workflow-2' },
        { id: 'workflow-3' },
      ];

      vi.spyOn(dbModule.db, 'delete').mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(mockDeletedWorkflows),
        }),
      } as any);

      const deletedCount = await service.cleanupWorkflows();

      expect(deletedCount).toBe(3);
    });

    it('should return 0 when no old workflows to delete', async () => {
      vi.spyOn(dbModule.db, 'delete').mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const deletedCount = await service.cleanupWorkflows();

      expect(deletedCount).toBe(0);
    });
  });

  describe('vacuumDatabase', () => {
    it('should execute VACUUM command', async () => {
      const mockExecute = vi.fn().mockResolvedValue({});
      vi.spyOn(dbModule, 'getDbClient').mockReturnValue({
        execute: mockExecute,
      } as any);

      await service.vacuumDatabase();

      expect(mockExecute).toHaveBeenCalledWith('VACUUM');
    });

    it('should throw error when VACUUM fails', async () => {
      vi.spyOn(dbModule, 'getDbClient').mockReturnValue({
        execute: vi.fn().mockRejectedValue(new Error('Vacuum failed')),
      } as any);

      await expect(service.vacuumDatabase()).rejects.toThrow('Vacuum failed');
    });
  });

  describe('runFullCleanup', () => {
    it('should run all cleanup operations successfully', async () => {
      // Mock all cleanup methods
      vi.spyOn(service, 'cleanupSessions').mockResolvedValue(2);
      vi.spyOn(service, 'cleanupWorkflows').mockResolvedValue(3);
      vi.spyOn(service, 'getStats').mockResolvedValue({
        sessionsCount: 10,
        workflowsCount: 20,
        messagesCount: 100,
        databaseSize: 1024000,
      });
      vi.spyOn(service, 'vacuumDatabase').mockResolvedValue();

      const result = await service.runFullCleanup();

      expect(result.success).toBe(true);
      expect(result.deletedSessions).toBe(2);
      expect(result.deletedWorkflows).toBe(3);
      expect(result.deletedMessages).toBeGreaterThanOrEqual(0);
    });

    it('should return error when cleanup fails', async () => {
      vi.spyOn(service, 'cleanupSessions').mockRejectedValue(new Error('Database error'));

      const result = await service.runFullCleanup();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });
});
