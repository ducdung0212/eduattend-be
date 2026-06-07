import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateClassDto } from './create-class.dto';

export class UpdateClassDto extends PartialType(
    OmitType(CreateClassDto, ['class_code'] as const)
) { }
