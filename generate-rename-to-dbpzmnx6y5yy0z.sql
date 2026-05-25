-- ============================================
-- Generate RENAME TABLE Statements
-- ============================================
-- Run this query in phpMyAdmin to generate all RENAME TABLE statements
-- Copy the output and execute it
-- ============================================

-- Replace 'hmherbs' with your CURRENT database name if different
SELECT CONCAT('RENAME TABLE `hmherbs`.`', table_name, '` TO `dbpzmnx6y5yy0z`.`', table_name, '`;') AS rename_statement
FROM information_schema.tables
WHERE table_schema = 'hmherbs'
ORDER BY table_name;

-- ============================================
-- After running this query:
-- 1. Copy all the generated statements
-- 2. Execute them one by one or all at once
-- 3. Verify all tables are in the new database
-- 4. Update your .env file to use 'dbpzmnx6y5yy0z'
-- 5. Drop the old database (only after confirming everything works)
-- ============================================

