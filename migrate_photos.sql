-- 1. Thêm cột image_url
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(255);
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(255);

-- 2. Migrate dữ liệu
UPDATE "students" 
SET "image_url" = (
    SELECT "image_url" FROM "student_photos" 
    WHERE "student_photos"."student_code" = "students"."student_code" 
    ORDER BY "created_at" DESC 
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1 FROM "student_photos" 
    WHERE "student_photos"."student_code" = "students"."student_code"
);

UPDATE "lecturers" 
SET "image_url" = (
    SELECT "image_url" FROM "lecturer_photos" 
    WHERE "lecturer_photos"."lecturer_code" = "lecturers"."lecturer_code" 
    ORDER BY "created_at" DESC 
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1 FROM "lecturer_photos" 
    WHERE "lecturer_photos"."lecturer_code" = "lecturers"."lecturer_code"
);

-- 3. Xóa bảng cũ
DROP TABLE IF EXISTS "student_photos";
DROP TABLE IF EXISTS "lecturer_photos";
