import { IsString, IsNotEmpty } from 'class-validator';

export class CheckInQrDto {
  @IsString()
  @IsNotEmpty({ message: "Mã sinh viên không được để trống" })
  student_code: string;

  @IsString()
  @IsNotEmpty({ message: "ID ca thi không được để trống" })
  exam_schedule_id: string;
}
