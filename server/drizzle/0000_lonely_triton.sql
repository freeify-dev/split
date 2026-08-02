CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` text NOT NULL,
	`actor_participant_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`verb` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_group_idx` ON `activity` (`group_id`,`id`);--> statement-breakpoint
CREATE TABLE `expense_payers` (
	`expense_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`amount` integer NOT NULL,
	PRIMARY KEY(`expense_id`, `participant_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `expense_payers_participant_idx` ON `expense_payers` (`participant_id`);--> statement-breakpoint
CREATE TABLE `expense_splits` (
	`expense_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`owed_amount` integer NOT NULL,
	`split_input` integer,
	PRIMARY KEY(`expense_id`, `participant_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `expense_splits_participant_idx` ON `expense_splits` (`participant_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`split_mode` text NOT NULL,
	`is_reimbursement` integer DEFAULT false NOT NULL,
	`rate_nanos` integer NOT NULL,
	`rate_source` text NOT NULL,
	`rate_date` text,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expenses_group_list_idx` ON `expenses` (`group_id`,`date`,`created_at`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate_nanos` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`date`, `currency`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_group_name_unique` ON `participants` (`group_id`,`name`);--> statement-breakpoint
CREATE INDEX `participants_group_idx` ON `participants` (`group_id`);