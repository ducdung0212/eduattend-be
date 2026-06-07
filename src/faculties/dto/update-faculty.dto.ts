import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateFacultyDto } from './create-faculty.dto';

export class UpdateFacultyDto extends PartialType(
  OmitType(CreateFacultyDto, ['faculty_code'] as const)
) { }