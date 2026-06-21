/*
  Warnings:

  - You are about to drop the column `is_active` on the `student_photos` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "student_photos_is_active_idx";

-- AlterTable
ALTER TABLE "student_photos" DROP COLUMN "is_active";
