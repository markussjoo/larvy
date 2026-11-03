CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`student_id` text NOT NULL,
	`code` text NOT NULL,
	`created` text NOT NULL,
	`used_by` text,
	`used_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_code_unique` ON `invitations` (`code`);