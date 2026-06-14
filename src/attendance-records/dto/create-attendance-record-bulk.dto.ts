import { IsArray, IsNotEmpty, IsString, IsUUID, ArrayMinSize } from 'class-validator';

export class CreateAttendanceRecordBulkDto {
  @IsUUID()
  @IsNotEmpty()
  exam_schedule_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  student_codes!: string[];
}