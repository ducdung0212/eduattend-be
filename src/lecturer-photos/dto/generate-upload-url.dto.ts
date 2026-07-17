// dto/generate-upload-url.dto.ts
import { IsString, IsIn, IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateLecturerUploadUrlItemDto {
  @IsString()
  fileName!: string;

  @IsIn(['image/jpeg', 'image/png'])
  fileType!: 'image/jpeg' | 'image/png';
}

export class GenerateLecturerUploadUrlDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120) 
  @ValidateNested({ each: true })
  @Type(() => GenerateLecturerUploadUrlItemDto)
  files!: GenerateLecturerUploadUrlItemDto[];
}
