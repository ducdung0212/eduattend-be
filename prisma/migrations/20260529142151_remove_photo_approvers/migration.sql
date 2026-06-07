/*
  Warnings:

  - You are about to drop the column `approved_at` on the `student_photos` table. All the data in the column will be lost.
  - You are about to drop the column `approved_by_user_id` on the `student_photos` table. All the data in the column will be lost.
  - You are about to drop the column `uploaded_by_user_id` on the `student_photos` table. All the data in the column will be lost.
  - You are about to drop the column `email_verified_at` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "student_photos" DROP CONSTRAINT "student_photos_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "student_photos" DROP CONSTRAINT "student_photos_uploaded_by_user_id_fkey";

-- DropIndex
DROP INDEX "student_photos_approved_by_user_id_idx";

-- DropIndex
DROP INDEX "student_photos_uploaded_by_user_id_idx";

-- AlterTable
ALTER TABLE "student_photos" DROP COLUMN "approved_at",
DROP COLUMN "approved_by_user_id",
DROP COLUMN "uploaded_by_user_id";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email_verified_at";
