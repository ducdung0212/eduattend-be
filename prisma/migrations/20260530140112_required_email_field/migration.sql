/*
  Warnings:

  - Made the column `email` on table `lecturers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `students` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "lecturers" ALTER COLUMN "email" SET NOT NULL;

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "email" SET NOT NULL;
