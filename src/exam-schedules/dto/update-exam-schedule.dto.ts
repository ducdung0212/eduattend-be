import { PartialType } from '@nestjs/mapped-types';
import { CreateExamScheduleDto } from './create-exam-schedule.dto';

export class UpdateExamScheduleDto extends PartialType(CreateExamScheduleDto) {}
