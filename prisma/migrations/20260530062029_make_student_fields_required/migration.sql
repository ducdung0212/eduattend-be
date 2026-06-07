/*
  Warnings:

  - Made the column `last_name` on table `lecturers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `first_name` on table `lecturers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `faculty_code` on table `lecturers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `class_code` on table `students` required. This step will fail if there are existing NULL values in that column.
  - Made the column `last_name` on table `students` required. This step will fail if there are existing NULL values in that column.
  - Made the column `first_name` on table `students` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_class_code_fkey";

-- AlterTable
ALTER TABLE "lecturers" ALTER COLUMN "last_name" SET NOT NULL,
ALTER COLUMN "first_name" SET NOT NULL,
ALTER COLUMN "faculty_code" SET NOT NULL;

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "class_code" SET NOT NULL,
ALTER COLUMN "last_name" SET NOT NULL,
ALTER COLUMN "first_name" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_code_fkey" FOREIGN KEY ("class_code") REFERENCES "classes"("class_code") ON DELETE RESTRICT ON UPDATE CASCADE;
