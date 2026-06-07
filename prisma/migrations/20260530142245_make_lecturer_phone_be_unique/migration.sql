/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `lecturers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "lecturers_phone_key" ON "lecturers"("phone");
