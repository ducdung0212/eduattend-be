/*
  Warnings:

  - The primary key for the `attendance_records` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `attendance_records` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `exam_schedules` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `room` on the `exam_schedules` table. All the data in the column will be lost.
  - The `id` column on the `exam_schedules` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `exam_supervisors` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `exam_supervisors` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `face_registration_windows` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `face_registration_windows` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `opened_by_user_id` column on the `face_registration_windows` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `user_id` column on the `lecturers` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `student_photos` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `student_photos` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `uploaded_by_user_id` column on the `student_photos` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `approved_by_user_id` column on the `student_photos` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `credit` on the `subjects` table. All the data in the column will be lost.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `student_code` on the `users` table. All the data in the column will be lost.
  - The `id` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[subject_code,exam_date,exam_time,room_code]` on the table `exam_schedules` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id]` on the table `students` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `exam_schedule_id` on the `attendance_records` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `room_code` to the `exam_schedules` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `exam_schedule_id` on the `exam_supervisors` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_exam_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "exam_supervisors" DROP CONSTRAINT "exam_supervisors_exam_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "face_registration_windows" DROP CONSTRAINT "face_registration_windows_opened_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "lecturers" DROP CONSTRAINT "lecturers_user_id_fkey";

-- DropForeignKey
ALTER TABLE "student_photos" DROP CONSTRAINT "student_photos_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "student_photos" DROP CONSTRAINT "student_photos_uploaded_by_user_id_fkey";

-- DropIndex
DROP INDEX "exam_schedules_subject_code_exam_date_exam_time_room_key";

-- DropIndex
DROP INDEX "users_student_code_idx";

-- AlterTable
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "exam_schedule_id",
ADD COLUMN     "exam_schedule_id" UUID NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "exam_schedules" DROP CONSTRAINT "exam_schedules_pkey",
DROP COLUMN "room",
ADD COLUMN     "room_code" VARCHAR(20) NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "exam_supervisors" DROP CONSTRAINT "exam_supervisors_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "exam_schedule_id",
ADD COLUMN     "exam_schedule_id" UUID NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "exam_supervisors_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "face_registration_windows" DROP CONSTRAINT "face_registration_windows_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "opened_by_user_id",
ADD COLUMN     "opened_by_user_id" UUID,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "face_registration_windows_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "faculties" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "lecturers" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "student_photos" DROP CONSTRAINT "student_photos_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "uploaded_by_user_id",
ADD COLUMN     "uploaded_by_user_id" UUID,
DROP COLUMN "approved_by_user_id",
ADD COLUMN     "approved_by_user_id" UUID,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "student_photos_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "user_id" UUID,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "subjects" DROP COLUMN "credit",
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "student_code",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "rooms" (
    "room_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("room_code")
);

-- CreateIndex
CREATE INDEX "attendance_records_exam_schedule_id_idx" ON "attendance_records"("exam_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_student_code_exam_schedule_id_key" ON "attendance_records"("student_code", "exam_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_schedules_subject_code_exam_date_exam_time_room_code_key" ON "exam_schedules"("subject_code", "exam_date", "exam_time", "room_code");

-- CreateIndex
CREATE INDEX "exam_supervisors_exam_schedule_id_idx" ON "exam_supervisors"("exam_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "lecturers_user_id_key" ON "lecturers"("user_id");

-- CreateIndex
CREATE INDEX "student_photos_uploaded_by_user_id_idx" ON "student_photos"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "student_photos_approved_by_user_id_idx" ON "student_photos"("approved_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_room_code_fkey" FOREIGN KEY ("room_code") REFERENCES "rooms"("room_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_supervisors" ADD CONSTRAINT "exam_supervisors_exam_schedule_id_fkey" FOREIGN KEY ("exam_schedule_id") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_exam_schedule_id_fkey" FOREIGN KEY ("exam_schedule_id") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_registration_windows" ADD CONSTRAINT "face_registration_windows_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
