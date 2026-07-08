import { IsString, IsNotEmpty } from 'class-validator';

export class CheckInDto {
  @IsString()
  @IsNotEmpty()
  exam_schedule_id: string;
}