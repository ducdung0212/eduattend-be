/*
  Warnings:

  - You are about to drop the column `class_name` on the `students` table. All the data in the column will be lost.
  - You are about to drop the `face_registration_windows` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `created_at` on table `attendance_records` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `attendance_records` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `classes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `classes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `exam_schedules` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `exam_schedules` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `exam_supervisors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `exam_supervisors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `faculties` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `faculties` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `lecturers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `lecturers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `rooms` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `rooms` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `student_photos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `student_photos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `students` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `students` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `subjects` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `subjects` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "exam_schedules" DROP CONSTRAINT "exam_schedules_room_code_fkey";

-- DropForeignKey
ALTER TABLE "face_registration_windows" DROP CONSTRAINT "face_registration_windows_opened_by_user_id_fkey";

-- AlterTable
ALTER TABLE "attendance_records" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "exam_schedules" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "exam_supervisors" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "faculties" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "lecturers" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "rooms" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_photos" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "students" DROP COLUMN "class_name",
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "subjects" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- DropTable
DROP TABLE "face_registration_windows";

-- CreateIndex
CREATE INDEX "attendance_records_student_code_idx" ON "attendance_records"("student_code");

-- CreateIndex
CREATE INDEX "exam_schedules_room_code_idx" ON "exam_schedules"("room_code");

-- CreateIndex
CREATE INDEX "exam_schedules_exam_date_idx" ON "exam_schedules"("exam_date");

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_room_code_fkey" FOREIGN KEY ("room_code") REFERENCES "rooms"("room_code") ON DELETE CASCADE ON UPDATE CASCADE;
