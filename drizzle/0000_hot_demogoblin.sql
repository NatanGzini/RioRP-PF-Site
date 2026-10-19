CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`member` text NOT NULL,
	`course` text NOT NULL,
	`started` integer NOT NULL,
	`submitted` integer,
	`score` integer,
	`passed` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`pages` integer NOT NULL,
	`file` text NOT NULL,
	`questions` text NOT NULL,
	`pass` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`user_id` text,
	`invite` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_id_unique` ON `members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_invite_unique` ON `members` (`invite`);--> statement-breakpoint
CREATE TABLE `reading` (
	`id` text PRIMARY KEY NOT NULL,
	`member` text NOT NULL,
	`course` text NOT NULL,
	`page` integer NOT NULL,
	`started` integer NOT NULL,
	`last` integer NOT NULL,
	`seconds` integer NOT NULL,
	`done` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`organization` text NOT NULL,
	`location` text NOT NULL,
	`details` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
