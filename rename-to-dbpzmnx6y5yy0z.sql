-- ============================================
-- SQL Script to Rename Database to dbpzmnx6y5yy0z
-- ============================================
-- NOTE: MySQL does not support RENAME DATABASE
-- This script provides the steps to rename your database
-- ============================================

-- Step 1: Create the new database
CREATE DATABASE IF NOT EXISTS `dbpzmnx6y5yy0z` 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- Step 2: Generate RENAME TABLE statements
-- Run this query FIRST to generate all the RENAME statements:
-- (Replace 'hmherbs' with your current database name if different)

SELECT CONCAT('RENAME TABLE `hmherbs`.`', table_name, '` TO `dbpzmnx6y5yy0z`.`', table_name, '`;') AS rename_statement
FROM information_schema.tables
WHERE table_schema = 'hmherbs'
ORDER BY table_name;

-- Step 3: Copy the output from Step 2 and execute all the RENAME TABLE statements
-- Example output will look like:
-- RENAME TABLE `hmherbs`.`admin_users` TO `dbpzmnx6y5yy0z`.`admin_users`;
-- RENAME TABLE `hmherbs`.`brands` TO `dbpzmnx6y5yy0z`.`brands`;
-- RENAME TABLE `hmherbs`.`products` TO `dbpzmnx6y5yy0z`.`products`;
-- ... (repeat for all tables)

-- Step 4: After all tables are moved, drop the old database
-- ⚠️ ONLY DO THIS AFTER CONFIRMING THE NEW DATABASE WORKS!
-- DROP DATABASE IF EXISTS `hmherbs`;

-- ============================================
-- ALTERNATIVE: Export/Import Method (Recommended)
-- ============================================
-- 1. Export current database: mysqldump -u user -p hmherbs > dump.sql
-- 2. Create new: CREATE DATABASE dbpzmnx6y5yy0z;
-- 3. Import: mysql -u user -p dbpzmnx6y5yy0z < dump.sql
-- 4. Drop old: DROP DATABASE hmherbs; (after confirming new works)

