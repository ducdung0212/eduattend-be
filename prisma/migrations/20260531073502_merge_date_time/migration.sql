/*
  Warnings:

  - You are about to drop the column `exam_date` on the `exam_schedules` table. All the data in the column will be lost.
  - You are about to drop the column `exam_time` on the `exam_schedules` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[subject_code,start_time,room_code]` on the table `exam_schedules` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `start_time` to the `exam_schedules` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "exam_schedules_exam_date_idx";

-- DropIndex
DROP INDEX "exam_schedules_subject_code_exam_date_exam_time_room_code_key";

-- AlterTable
ALTER TABLE "exam_schedules" DROP COLUMN "exam_date",
DROP COLUMN "exam_time",
ADD COLUMN     "start_time" TIMESTAMPTZ(3) NOT NULL;

-- CreateIndex
CREATE INDEX "exam_schedules_start_time_idx" ON "exam_schedules"("start_time");

-- CreateIndex
CREATE UNIQUE INDEX "exam_schedules_subject_code_start_time_room_code_key" ON "exam_schedules"("subject_code", "start_time", "room_code");
