-- AlterTable
ALTER TABLE "exam_schedules" ADD COLUMN     "exam_period_id" UUID;

-- CreateTable
CREATE TABLE "exam_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "exam_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_schedules_exam_period_id_idx" ON "exam_schedules"("exam_period_id");

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_period_id_fkey" FOREIGN KEY ("exam_period_id") REFERENCES "exam_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
