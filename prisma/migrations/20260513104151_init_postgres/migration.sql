-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'lecturer', 'student');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('face', 'qr_code');

-- CreateEnum
CREATE TYPE "RekognitionResult" AS ENUM ('match', 'not_match', 'unknown');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(0),
    "role" "Role" NOT NULL DEFAULT 'lecturer',
    "student_code" VARCHAR(20),
    "password" TEXT NOT NULL,
    "remember_token" VARCHAR(100),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "faculty_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("faculty_code")
);

-- CreateTable
CREATE TABLE "classes" (
    "class_code" VARCHAR(20) NOT NULL,
    "class_name" VARCHAR(100) NOT NULL,
    "faculty_code" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "classes_pkey" PRIMARY KEY ("class_code")
);

-- CreateTable
CREATE TABLE "subjects" (
    "subject_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "credit" INTEGER,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("subject_code")
);

-- CreateTable
CREATE TABLE "students" (
    "student_code" VARCHAR(20) NOT NULL,
    "class_name" VARCHAR(191),
    "class_code" VARCHAR(20),
    "last_name" VARCHAR(70),
    "first_name" VARCHAR(30),
    "email" VARCHAR(100),
    "phone" VARCHAR(15),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "students_pkey" PRIMARY KEY ("student_code")
);

-- CreateTable
CREATE TABLE "lecturers" (
    "lecturer_code" VARCHAR(20) NOT NULL,
    "user_id" TEXT,
    "last_name" VARCHAR(70),
    "first_name" VARCHAR(30),
    "email" VARCHAR(100),
    "phone" VARCHAR(15),
    "faculty_code" VARCHAR(20),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "lecturers_pkey" PRIMARY KEY ("lecturer_code")
);

-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "subject_code" VARCHAR(20) NOT NULL,
    "exam_date" DATE NOT NULL,
    "exam_time" TIME NOT NULL,
    "duration" INTEGER NOT NULL,
    "room" VARCHAR(50) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_supervisors" (
    "id" TEXT NOT NULL,
    "exam_schedule_id" TEXT NOT NULL,
    "lecturer_code" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "exam_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "exam_schedule_id" TEXT NOT NULL,
    "student_code" VARCHAR(20) NOT NULL,
    "attendance_method" "AttendanceMethod" DEFAULT 'face',
    "rekognition_result" "RekognitionResult",
    "confidence" DECIMAL(5,2),
    "attendance_time" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_photos" (
    "id" TEXT NOT NULL,
    "student_code" VARCHAR(20) NOT NULL,
    "image_url" VARCHAR(255) NOT NULL,
    "uploaded_by_user_id" TEXT,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(0),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "student_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_registration_windows" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120),
    "starts_at" TIMESTAMP(0) NOT NULL,
    "ends_at" TIMESTAMP(0) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "opened_by_user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "face_registration_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_student_code_idx" ON "users"("student_code");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_name_key" ON "faculties"("name");

-- CreateIndex
CREATE INDEX "classes_faculty_code_idx" ON "classes"("faculty_code");

-- CreateIndex
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");

-- CreateIndex
CREATE UNIQUE INDEX "students_phone_key" ON "students"("phone");

-- CreateIndex
CREATE INDEX "students_class_code_idx" ON "students"("class_code");

-- CreateIndex
CREATE UNIQUE INDEX "lecturers_user_id_key" ON "lecturers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lecturers_email_key" ON "lecturers"("email");

-- CreateIndex
CREATE INDEX "lecturers_faculty_code_idx" ON "lecturers"("faculty_code");

-- CreateIndex
CREATE UNIQUE INDEX "exam_schedules_subject_code_exam_date_exam_time_room_key" ON "exam_schedules"("subject_code", "exam_date", "exam_time", "room");

-- CreateIndex
CREATE INDEX "exam_supervisors_exam_schedule_id_idx" ON "exam_supervisors"("exam_schedule_id");

-- CreateIndex
CREATE INDEX "exam_supervisors_lecturer_code_idx" ON "exam_supervisors"("lecturer_code");

-- CreateIndex
CREATE INDEX "attendance_records_exam_schedule_id_idx" ON "attendance_records"("exam_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_student_code_exam_schedule_id_key" ON "attendance_records"("student_code", "exam_schedule_id");

-- CreateIndex
CREATE INDEX "student_photos_student_code_idx" ON "student_photos"("student_code");

-- CreateIndex
CREATE INDEX "student_photos_uploaded_by_user_id_idx" ON "student_photos"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "student_photos_approved_by_user_id_idx" ON "student_photos"("approved_by_user_id");

-- CreateIndex
CREATE INDEX "student_photos_is_active_idx" ON "student_photos"("is_active");

-- CreateIndex
CREATE INDEX "face_registration_windows_is_active_starts_at_ends_at_idx" ON "face_registration_windows"("is_active", "starts_at", "ends_at");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_faculty_code_fkey" FOREIGN KEY ("faculty_code") REFERENCES "faculties"("faculty_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_code_fkey" FOREIGN KEY ("class_code") REFERENCES "classes"("class_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_faculty_code_fkey" FOREIGN KEY ("faculty_code") REFERENCES "faculties"("faculty_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_subject_code_fkey" FOREIGN KEY ("subject_code") REFERENCES "subjects"("subject_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_supervisors" ADD CONSTRAINT "exam_supervisors_exam_schedule_id_fkey" FOREIGN KEY ("exam_schedule_id") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_supervisors" ADD CONSTRAINT "exam_supervisors_lecturer_code_fkey" FOREIGN KEY ("lecturer_code") REFERENCES "lecturers"("lecturer_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_exam_schedule_id_fkey" FOREIGN KEY ("exam_schedule_id") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_code_fkey" FOREIGN KEY ("student_code") REFERENCES "students"("student_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_student_code_fkey" FOREIGN KEY ("student_code") REFERENCES "students"("student_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_registration_windows" ADD CONSTRAINT "face_registration_windows_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
