import { IsArray, IsNotEmpty, IsString, IsUUID, ArrayMinSize } from 'class-validator';

export class CreateExamSupervisorBulkDto {
  @IsUUID()
  @IsNotEmpty()
  exam_schedule_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  lecturer_codes!: string[];
}