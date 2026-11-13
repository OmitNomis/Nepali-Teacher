CREATE TABLE `syllables` (
	`ne` text PRIMARY KEY NOT NULL,
	`audio_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`audio_id`) REFERENCES `audio`(`id`) ON UPDATE no action ON DELETE set null
);
