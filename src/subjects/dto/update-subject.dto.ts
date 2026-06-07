import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateSubjectDto } from './create-subject.dto';

export class UpdateSubjectDto extends PartialType(
    OmitType(CreateSubjectDto, ['subject_code'] as const)
) { }
