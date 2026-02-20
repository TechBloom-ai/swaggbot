CREATE INDEX `idx_messages_session_id` ON `messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_workflow_id` ON `messages` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_session_id_created_at` ON `messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_executions_workflow_id` ON `workflow_executions` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflows_session_id` ON `workflows` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_workflows_status_completed_at` ON `workflows` (`status`,`completed_at`);