/*
  Warnings:

  - Added the required column `group` to the `exam_schedules` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "exam_schedules" ADD COLUMN     "group" INTEGER NOT NULL;
