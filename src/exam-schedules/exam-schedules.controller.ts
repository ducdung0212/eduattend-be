import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ExamSchedulesService } from './exam-schedules.service';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';

@Controller('exam-schedules')
export class ExamSchedulesController {
  constructor(private readonly examSchedulesService: ExamSchedulesService) { }

  @Post()
  create(@Body() createExamScheduleDto: CreateExamScheduleDto) {
    return this.examSchedulesService.create(createExamScheduleDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('start_time') start_time?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.examSchedulesService.findAll({
      search,
      start_time,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examSchedulesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateExamScheduleDto: UpdateExamScheduleDto) {
    return this.examSchedulesService.update(id, updateExamScheduleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.examSchedulesService.remove(id);
  }
}
