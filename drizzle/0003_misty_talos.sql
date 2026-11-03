CREATE TABLE `lesson_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`sources` text NOT NULL,
	`status` text NOT NULL,
	`material_id` text,
	`updated` text NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action
);
