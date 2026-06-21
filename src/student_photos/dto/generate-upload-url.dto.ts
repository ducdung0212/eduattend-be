// dto/generate-upload-url.dto.ts
import { IsString, IsIn, IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateUploadUrlItemDto {
  @IsString()
  fileName!: string;

  @IsIn(['image/jpeg', 'image/png'])
  fileType!: 'image/jpeg' | 'image/png';
}

export class GenerateUploadUrlDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120) // giống giới hạn trong Laravel: max:120
  @ValidateNested({ each: true })
  @Type(() => GenerateUploadUrlItemDto)
  files!: GenerateUploadUrlItemDto[];
}