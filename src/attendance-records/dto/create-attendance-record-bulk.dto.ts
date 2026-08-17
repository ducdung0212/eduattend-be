import { IsArray, IsNotEmpty, IsString, IsUUID, ArrayMinSize, IsOptional, IsBoolean } from 'class-validator';

export class CreateAttendanceRecordBulkDto {
  @IsUUID()
  @IsNotEmpty()
  exam_schedule_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  student_codes!: string[];

  @IsOptional()
  @IsBoolean()
  force_capacity_override?: boolean;
}