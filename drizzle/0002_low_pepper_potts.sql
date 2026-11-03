CREATE TABLE `student_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_sessions_token_hash_unique` ON `student_sessions` (`token_hash`);