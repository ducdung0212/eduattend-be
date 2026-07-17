// dto/confirm-upload.dto.ts
import { IsString, Matches, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmLecturerUploadItemDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã giảng viên không đúng định dạng' })
  lecturer_code!: string;

  @IsString()
  fileName!: string;
}

export class ConfirmLecturerUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => ConfirmLecturerUploadItemDto)
  uploads!: ConfirmLecturerUploadItemDto[];
}
