import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateFacultyDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên khoa không được để trống' })
  @MaxLength(100, { message: 'Tên khoa không được vượt quá 100 ký tự' })
  name!: string;
}