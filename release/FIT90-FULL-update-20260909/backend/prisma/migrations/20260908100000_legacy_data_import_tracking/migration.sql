CREATE TABLE `data_import_batches` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `batch_hash` VARCHAR(64) NOT NULL,
  `source_manifest` JSON NULL,
  `target_branch_id` INT NOT NULL,
  `environment` VARCHAR(20) NOT NULL,
  `dry_run` BOOLEAN NOT NULL DEFAULT true,
  `status` VARCHAR(20) NOT NULL DEFAULT 'running',
  `summary` JSON NULL,
  `failure_code` VARCHAR(100) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `data_import_batches_batch_hash_key`(`batch_hash`),
  INDEX `data_import_batches_target_branch_id_status_idx`(`target_branch_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `data_import_records` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `batch_id` INT NOT NULL,
  `source_file` VARCHAR(255) NOT NULL,
  `sheet_name` VARCHAR(100) NOT NULL,
  `source_row_number` INT NOT NULL,
  `legacy_id` VARCHAR(100) NULL,
  `target_table` VARCHAR(100) NOT NULL,
  `target_id` INT NULL,
  `result` VARCHAR(20) NOT NULL,
  `error_code` VARCHAR(100) NULL,
  `details` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_data_import_source_record`(`source_file`, `sheet_name`, `source_row_number`, `target_table`),
  INDEX `data_import_records_batch_id_idx`(`batch_id`),
  INDEX `data_import_records_target_table_target_id_idx`(`target_table`, `target_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `data_import_records_batch_id_fkey`
    FOREIGN KEY (`batch_id`) REFERENCES `data_import_batches`(`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
