// dto/confirm-upload.dto.ts
import { IsString, Matches, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmUploadItemDto {
  @IsString()
  @Matches(/^DH\d{8}$/i, { message: 'student_code phải đúng định dạng DHxxxxxxxx' })
  student_code!: string;

  @IsString()
  fileName!: string;
}

export class ConfirmUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => ConfirmUploadItemDto)
  uploads!: ConfirmUploadItemDto[];
}