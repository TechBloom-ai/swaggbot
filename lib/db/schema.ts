import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Sessions table - stores session configuration and metadata
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  swaggerUrl: text('swagger_url').notNull(),
  swaggerDoc: text('swagger_doc').notNull(), // JSON string of the Swagger/OpenAPI doc
  authToken: text('auth_token'), // Optional authentication token
  baseUrl: text('base_url'), // Extracted from Swagger servers
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Workflows table - stores workflow plans
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  steps: text('steps').notNull(), // JSON array of workflow steps
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] })
    .notNull()
    .default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// Workflow executions table - stores execution results for debugging
export const workflowExecutions = sqliteTable('workflow_executions', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').notNull(),
  status: text('status', { enum: ['completed', 'failed'] }).notNull(),
  request: text('request').notNull(), // JSON: curl command, headers, body
  response: text('response'), // JSON: response data (may be truncated if large)
  extracted: text('extracted'), // JSON: extracted values from response
  error: text('error'), // Error message if failed
  executedAt: integer('executed_at', { mode: 'timestamp' }).notNull(),
});

// Settings table - key-value store for application settings
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Define relations
export const sessionsRelations = relations(sessions, ({ many }) => ({
  workflows: many(workflows),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  session: one(sessions, {
    fields: [workflows.sessionId],
    references: [sessions.id],
  }),
  executions: many(workflowExecutions),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowExecutions.workflowId],
    references: [workflows.id],
  }),
}));

// Type exports
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
