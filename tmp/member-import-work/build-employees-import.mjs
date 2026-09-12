import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "E:/final_projects/asmaa/23-8-2026/FIT90_19-8/outputs/employees-server-import-20260909";

const employees = [
  [1001, "dr.fadi elsewesy", "1000008407", 1, 1, "مدير عام", 1, "admin"],
  [1002, "mahmoud ossama", "1004433293", 1, 1, "مدير عام", 1, "admin"],
  [1003, "mostafa hegazy", "1102009791", 1, 17, "مدير اللياقة البدنية", null, "fitness manager"],
  [1004, "mohamed yasser", "1007653349", 1, 15, "مدرب", null, "personal trainer"],
  [1005, "fares hassan", "1025123658", 1, 15, "مدرب", null, "personal trainer"],
  [1006, "menna hassan", "1080694454", 1, 15, "مدرب", null, "personal trainer"],
  [1007, "raef ramadan", "1068061170", 1, 15, "مدرب", null, "personal trainer"],
  [1008, "breksam attia", "1017148793", 1, 15, "مدرب", null, "personal trainer"],
  [1009, "huda gamal", "1094779688", 1, 15, "مدرب", null, "personal trainer"],
  [1010, "mohamed bakr", "1017436313", 1, 15, "مدرب", null, "personal trainer"],
  [1011, "asmaa samir", "1096629985", 1, 15, "مدرب", null, "personal trainer"],
  [1012, "aly hesham", "1025334772", 1, 15, "مدرب", null, "personal trainer"],
  [1013, "ahmed farouq", "1220313220", 1, 15, "مدرب", null, "personal trainer"],
  [1014, "radwa sameh", "1020390977", 1, 15, "مدرب", null, "personal trainer"],
  [1015, "abdelrahman mansor", "1066752855", 1, 15, "مدرب", null, "personal trainer"],
  [1016, "amr khaled", "1010982786", 1, 15, "مدرب", null, "personal trainer"],
  [1017, "omar nabil", "1011791477", 1, 15, "مدرب", null, "personal trainer"],
  [1018, "retaj samy", "1080454491", 1, 15, "مدرب", null, "personal trainer"],
  [1019, "mostafa gamal", "1005286947", 1, 9, "أخصائي تغذية", 1, "nutritionist"],
  [1020, "mohamed ossama", "1212501854", 1, 6, "أخصائي سبا", 6, "masseur"],
  [1021, "nada elsayed", "1027125851", 1, 6, "أخصائي سبا", 6, "masseur"],
  [1022, "heba mohamed", "1070909129", 1, 18, "مدير العمليات", null, "operation manager"],
  [1023, "youssef mohamed", "1113444772", 1, 5, "موظف استقبال", 5, "receptionist"],
  [1024, "kholoud nasser", "1275165680", 1, 5, "موظف استقبال", 5, "receptionist"],
  [1025, "fares waleed", "1070909130", 1, 12, "أخصائي مبيعات", 4, "sales"],
  [1026, "ahmed hussen", "1070909131", 1, 12, "أخصائي مبيعات", 4, "sales"],
];

const accounts = employees.map(([empCode, name, , , jobCode]) => ({
  empCode,
  name,
  username: name,
  level: jobCode === 1 ? 1 : 2,
}));

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("employees");
const headers = [
  "كود الموظف", "اسم الموظف", "رقم الجوال", "الفرع", "كود المسمى",
  "المسمى الوظيفي", "كود الإدارة", "الوظيفة في الملف", "اسم المستخدم", "كلمة المرور الافتراضية",
];
sheet.getRange("A1:J1").values = [headers];
sheet.getRange(`A2:J${employees.length + 1}`).values = employees.map((row, index) => [
  row[0], row[1], row[2], row[3], row[4], row[5], row[6] ?? "", row[7], accounts[index].username, "102030",
]);
sheet.getRange(`A1:J${employees.length + 1}`).format.horizontalAlignment = "center";
sheet.getRange(`A1:J${employees.length + 1}`).format.verticalAlignment = "center";
sheet.getRange("A1:J1").format = {
  fill: "#8C1D24",
  font: { bold: true, color: "#FFFFFF", size: 12 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange(`A2:J${employees.length + 1}`).format.wrapText = true;
sheet.getRange(`A2:J${employees.length + 1}`).format.rowHeight = 22;
sheet.getRange("A1:J1").format.rowHeight = 28;
sheet.getRange("A:A").format.columnWidth = 13;
sheet.getRange("B:B").format.columnWidth = 26;
sheet.getRange("C:C").format.columnWidth = 16;
sheet.getRange("D:G").format.columnWidth = 16;
sheet.getRange("H:H").format.columnWidth = 22;
sheet.getRange("I:I").format.columnWidth = 28;
sheet.getRange("J:J").format.columnWidth = 18;
sheet.freezePanes.freezeRows(1);
sheet.tables.add(`A1:J${employees.length + 1}`, true, "EmployeesImport");

const workbookOutput = await SpreadsheetFile.exportXlsx(workbook);
await workbookOutput.save(`${outputDir}/employees-ready.xlsx`);

const columns = [
  "emp_code", "employee", "branch_id_fk", "phone", "mosma_wazefy_code",
  "mosma_wazefy_n", "edara_id", "emp_type", "employee_type", "employment_type",
  "leave_emp", "demo_card", "shahadt_jaish", "tamin_rkm", "khedma_year",
];
const valueRows = employees.map((row) => `  (${[
  row[0], sqlString(row[1]), row[3], sqlString(row[2]), row[4], sqlString(row[5]),
  row[6] ?? "NULL", 1, 1, sqlString(row[7]), 0, sqlString("0"), sqlString("no"), 0, 0,
].join(", ")})`).join(",\n");
const userUpdates = accounts.map((account) => `UPDATE users\nSET emp_code = (SELECT id FROM employees WHERE emp_code = ${account.empCode}),\n    name = ${sqlString(account.name)},\n    password = @initial_password_hash,\n    level = ${account.level},\n    branch_id_fk = 1,\n    approved = 1,\n    app_pass = NULL,\n    user_pass = NULL,\n    x_y_z = NULL,\n    pass_demo = NULL,\n    must_change_password = 0\nWHERE username = ${sqlString(account.username)};`).join("\n\n");
const userSelects = accounts.map((account) => `SELECT e.id, ${sqlString(account.username)}, @initial_password_hash, ${sqlString(account.name)}, ${account.level}, e.branch_id_fk, 1, '', 0\nFROM employees e\nWHERE e.emp_code = ${account.empCode}\n  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = ${sqlString(account.username)})`).join("\nUNION ALL\n");

const sql = `-- FIT90: replace the employees table with the 26 supplied employees and their user accounts.\n-- Run this file only after selecting database metacodecx_fit90 in phpMyAdmin.\n-- The following employee-only dependent records are intentionally cleared: files, allowances/deductions, attendance, and branch assignments.\n-- Employment contracts, schedules, bookings, invoices, and historical club records are intentionally preserved.\n-- Every imported user is active; General Manager accounts (job code 1) start as system admins (level 1).\n-- The initial password is 102030 stored as a hash and upgraded to bcrypt at first login.\n\nSTART TRANSACTION;\n\n-- Clear employee-only dependent records before deleting employees.\nDELETE FROM emp_files;\nDELETE FROM hr_finance_employes;\nDELETE FROM hr_emp_dwam_details;\nDELETE FROM hr_emp_dwam;\nDELETE FROM employees_branches;\nDELETE FROM employees;\n\nINSERT INTO employees (${columns.join(", ")})\nVALUES\n${valueRows};\n\nSET @initial_password_hash = SHA1(MD5('102030'));\n\n-- Keep an existing account only when it already uses one of the supplied usernames; update its link and password.\n${userUpdates}\n\n-- Create any accounts that do not already exist.\nINSERT INTO users (emp_code, username, password, name, level, branch_id_fk, approved, device_token, must_change_password)\n${userSelects};\n\nCOMMIT;\n\nSELECT COUNT(*) AS imported_employees FROM employees;\nSELECT COUNT(*) AS imported_users FROM users WHERE emp_code IN (SELECT id FROM employees WHERE emp_code BETWEEN 1001 AND 1026);\n`;
await fs.writeFile(`${outputDir}/employees-import.sql`, sql, "utf8");

await workbook.recalculate();
const preview = await workbook.render({ sheetName: "employees", range: `A1:J${employees.length + 1}`, scale: 1.5 });
await fs.writeFile(`${outputDir}/employees-preview.png`, Buffer.from(await preview.arrayBuffer()));

console.log(JSON.stringify({ outputDir, employees: employees.length, users: accounts.length }, null, 2));
