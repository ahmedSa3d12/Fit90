import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = 'E:/final_projects/asmaa/23-8-2026/FIT90_19-8';
const PACKAGE = path.join(ROOT, 'outputs/data-migration/final-upload-package-20260908');
const MEMBERS_CSV = path.join(PACKAGE, 'members_final.csv');
const ADDITIONAL_MEMBERS_INSPECTION = path.join(PACKAGE, 'excluded_members_for_client.xlsx.inspect.ndjson');
const OUTPUT = path.join(PACKAGE, 'add_mobile_app_accounts_for_migrated_members.sql');
const EXPECTED_DATABASE = 'metacodecx_fit90';
const TARGET_BRANCH_ID = 1;
const BCRYPT_ROUNDS = 12;

if (!isMainThread) {
  const bcrypt = (await import('../backend/node_modules/bcryptjs/index.js')).default;
  const result = workerData.rows.map((row) => ({ ...row, passwordHash: bcrypt.hashSync(row.password, BCRYPT_ROUNDS) }));
  parentPort.postMessage(result);
} else {
  const normalizeText = (value) => String(value ?? '').normalize('NFKC').replace(/[\u200B\uFEFF]/g, '').trim();
  const normalizePhone = (value) => normalizeText(value)
    .replace(/[٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹]/g, (digit) => '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10)
    .replace(/\s+/g, '');
  const passwordFromPhone = (phone) => phone.replace(/\D/g, '') || phone;
  const sqlValue = (value) => {
    const text = normalizeText(value);
    return text ? `'${text.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\0/g, '')}'` : 'NULL';
  };
  const parseCsv = (line) => {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = !quoted; }
      } else if (char === ',' && !quoted) { cells.push(cell); cell = ''; } else { cell += char; }
    }
    cells.push(cell);
    return cells;
  };
  const csvRows = () => {
    const lines = fs.readFileSync(MEMBERS_CSV, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const headers = parseCsv(lines.shift());
    const index = Object.fromEntries(headers.map((header, position) => [header, position]));
    return lines.map(parseCsv).map((row) => ({
      legacyMemberId: normalizeText(row[index.legacy_member_id]),
      name: normalizeText(row[index.name]),
      phone: normalizePhone(row[index.phone]),
      email: normalizeText(row[index.email]),
    }));
  };
  const additionalRows = async () => {
    const table = fs.readFileSync(ADDITIONAL_MEMBERS_INSPECTION, 'utf8').split(/\r?\n/)
      .filter(Boolean).map(JSON.parse).find((item) => item.kind === 'table');
    if (!table?.values?.length) throw new Error('Saved inspection of excluded_members_for_client.xlsx is unavailable.');
    const headers = table.values[3];
    const index = Object.fromEntries(headers.map((header, position) => [normalizeText(header), position]));
    const rows = [];
    for (const row of table.values.slice(4)) {
      const reason = normalizeText(row[index['سبب الاستبعاد']]);
      if (!reason || reason.includes('رقم الهاتف مكرر')) continue;
      rows.push({
        legacyMemberId: normalizeText(row[index.ID]),
        name: normalizeText(row[index['الاسم العربي']]) || normalizeText(row[index['الاسم الإنجليزي']]),
        phone: normalizePhone(row[index['الهاتف']]),
        email: normalizeText(row[index['البريد الإلكتروني']]),
      });
    }
    return rows;
  };
  const hashRows = async (rows) => {
    const workerCount = Math.min(Math.max(1, os.cpus().length - 1), 6, rows.length);
    const batchSize = Math.ceil(rows.length / workerCount);
    const batches = Array.from({ length: workerCount }, (_, index) => rows.slice(index * batchSize, (index + 1) * batchSize));
    const results = await Promise.all(batches.map((batch) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { rows: batch } });
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => { if (code !== 0) reject(new Error(`Password-hash worker exited with code ${code}`)); });
    })));
    return results.flat();
  };
  const insertBatches = (rows) => {
    const statements = [];
    for (let start = 0; start < rows.length; start += 200) {
      const values = rows.slice(start, start + 200).map((row) => `(${[
        sqlValue(row.legacyMemberId), sqlValue(row.name), sqlValue(row.phone), sqlValue(row.email), sqlValue(row.passwordHash),
      ].join(', ')})`).join(',\n');
      statements.push('INSERT INTO `_fit90_mobile_account_import` (`legacy_member_id`, `name`, `phone`, `email`, `password_hash`) VALUES\n' + values + ';');
    }
    return statements.join('\n\n');
  };

  const baseRows = csvRows();
  const extraRows = await additionalRows();
  const allSourceRows = [...baseRows, ...extraRows];
  const candidates = allSourceRows.filter((row) => row.legacyMemberId && row.name && row.phone && row.phone.length <= 20);
  const byMemberId = new Set();
  const byPhone = new Set();
  for (const row of candidates) {
    if (byMemberId.has(row.legacyMemberId)) throw new Error(`Duplicate legacy member ID: ${row.legacyMemberId}`);
    if (byPhone.has(row.phone)) throw new Error(`Duplicate phone among login candidates: ${row.phone}`);
    byMemberId.add(row.legacyMemberId);
    byPhone.add(row.phone);
    row.password = passwordFromPhone(row.phone);
  }
  const skippedWithoutUsablePhone = allSourceRows.length - candidates.length;
  const rows = await hashRows(candidates);
  const sql = `-- Creates and links mobile-app accounts only for imported FIT90 members with a usable unique phone number.\n-- Login endpoint: POST /mobile/app/login with {"phone":"stored phone","password":"phone digits only"}.\n-- Passwords below are bcrypt hashes (cost ${BCRYPT_ROUNDS}); no plaintext passwords are written to this file.\n-- Safe rerun: existing linked accounts are left untouched. The script stops before changes if a conflicting api_users phone already exists.\nSET NAMES utf8mb4;\nSET @target_branch_id := ${TARGET_BRANCH_ID};\nSET @expected_database := ${sqlValue(EXPECTED_DATABASE)};\n\nCREATE TEMPORARY TABLE \`_fit90_mobile_account_import\` (\n  \`legacy_member_id\` VARCHAR(30) NOT NULL,\n  \`name\` VARCHAR(200) NOT NULL,\n  \`phone\` VARCHAR(20) NOT NULL,\n  \`email\` VARCHAR(150) NULL,\n  \`password_hash\` VARCHAR(500) NOT NULL,\n  PRIMARY KEY (\`legacy_member_id\`),\n  UNIQUE KEY \`uq_fit90_mobile_phone\` (\`phone\`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n${insertBatches(rows)}\n\nSELECT (BINARY DATABASE() = BINARY @expected_database) INTO @database_ok;\nSELECT EXISTS(\n  SELECT 1 FROM \`tbl_branches\`\n  WHERE \`branch_id\` = @target_branch_id\n    AND BINARY LOWER(TRIM(\`branch_name\`)) = BINARY 'fit90'\n) INTO @branch_ok;\n\n-- A pre-existing app account for an unlinked imported member is reviewed manually rather than being reused or overwritten.\nSELECT COUNT(*) INTO @phone_conflicts\nFROM \`_fit90_mobile_account_import\` i\nJOIN \`club_members\` m\n  ON BINARY m.\`member_code\` = BINARY CONCAT('MIG-', i.\`legacy_member_id\`)\n AND BINARY m.\`phone\` = BINARY i.\`phone\`\nJOIN \`api_users\` a ON BINARY a.\`user_phone\` = BINARY i.\`phone\`\nWHERE m.\`branch_id\` = @target_branch_id\n  AND m.\`is_deleted\` = 0\n  AND m.\`app_user_id\` IS NULL;\n\nSET @is_safe := @database_ok AND @branch_ok AND @phone_conflicts = 0;\nSELECT @is_safe AS \`precheck_passed\`, @database_ok AS \`database_ok\`, @branch_ok AS \`branch_ok\`, @phone_conflicts AS \`existing_app_account_conflicts\`;\n\nSTART TRANSACTION;\n\nINSERT INTO \`api_users\` (\`user_name\`, \`user_phone\`, \`user_email\`, \`user_pass\`, \`status\`)\nSELECT LEFT(i.\`name\`, 100), i.\`phone\`, NULLIF(LEFT(i.\`email\`, 70), ''), i.\`password_hash\`, 1\nFROM \`_fit90_mobile_account_import\` i\nJOIN \`club_members\` m\n  ON BINARY m.\`member_code\` = BINARY CONCAT('MIG-', i.\`legacy_member_id\`)\n AND BINARY m.\`phone\` = BINARY i.\`phone\`\nLEFT JOIN \`api_users\` a ON BINARY a.\`user_phone\` = BINARY i.\`phone\`\nWHERE @is_safe = 1\n  AND m.\`branch_id\` = @target_branch_id\n  AND m.\`is_deleted\` = 0\n  AND m.\`app_user_id\` IS NULL\n  AND a.\`user_id\` IS NULL;\nSELECT ROW_COUNT() AS \`mobile_app_accounts_created\`;\n\nUPDATE \`club_members\` m\nJOIN \`_fit90_mobile_account_import\` i\n  ON BINARY m.\`member_code\` = BINARY CONCAT('MIG-', i.\`legacy_member_id\`)\n AND BINARY m.\`phone\` = BINARY i.\`phone\`\nJOIN \`api_users\` a ON BINARY a.\`user_phone\` = BINARY i.\`phone\`\nSET m.\`app_user_id\` = a.\`user_id\`, m.\`updated_at\` = NOW(3)\nWHERE @is_safe = 1\n  AND m.\`branch_id\` = @target_branch_id\n  AND m.\`is_deleted\` = 0\n  AND m.\`app_user_id\` IS NULL;\nSELECT ROW_COUNT() AS \`members_linked_to_mobile_app_accounts\`;\n\nCOMMIT;\n\nSELECT\n  ${allSourceRows.length} AS \`migration_rows_considered\`,\n  ${rows.length} AS \`members_with_usable_unique_phone_in_source\`,\n  ${skippedWithoutUsablePhone} AS \`source_rows_without_usable_phone\`,\n  (SELECT COUNT(*)\n   FROM \`club_members\` m\n   JOIN \`_fit90_mobile_account_import\` i\n     ON BINARY m.\`member_code\` = BINARY CONCAT('MIG-', i.\`legacy_member_id\`)\n    AND BINARY m.\`phone\` = BINARY i.\`phone\`\n   JOIN \`api_users\` a ON m.\`app_user_id\` = a.\`user_id\`\n   WHERE m.\`branch_id\` = @target_branch_id\n     AND m.\`is_deleted\` = 0\n     AND a.\`status\` = 1) AS \`active_linked_members_after_run\`;\n\nDROP TEMPORARY TABLE \`_fit90_mobile_account_import\`;\n`;
  fs.writeFileSync(OUTPUT, sql, 'utf8');
  console.log(JSON.stringify({ output: OUTPUT, baseRows: baseRows.length, additionalSelectedRows: extraRows.length, candidates: rows.length, skippedWithoutUsablePhone }));
}
