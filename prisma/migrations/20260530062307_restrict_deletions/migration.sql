-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_faculty_code_fkey";

-- DropForeignKey
ALTER TABLE "exam_schedules" DROP CONSTRAINT "exam_schedules_room_code_fkey";

-- DropForeignKey
ALTER TABLE "exam_schedules" DROP CONSTRAINT "exam_schedules_subject_code_fkey";

-- DropForeignKey
ALTER TABLE "lecturers" DROP CONSTRAINT "lecturers_faculty_code_fkey";

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_faculty_code_fkey" FOREIGN KEY ("faculty_code") REFERENCES "faculties"("faculty_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_faculty_code_fkey" FOREIGN KEY ("faculty_code") REFERENCES "faculties"("faculty_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_subject_code_fkey" FOREIGN KEY ("subject_code") REFERENCES "subjects"("subject_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_room_code_fkey" FOREIGN KEY ("room_code") REFERENCES "rooms"("room_code") ON DELETE RESTRICT ON UPDATE CASCADE;
