import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ExamSupervisorsService } from './exam-supervisors.service';
import { CreateExamSupervisorDto } from './dto/create-exam-supervisor.dto';
import { UpdateExamSupervisorDto } from './dto/update-exam-supervisor.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CreateExamSupervisorBulkDto } from './dto/create-exam-supervisor-bulk.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'lecturer')
@Controller('exam-supervisors')
export class ExamSupervisorsController {
  constructor(private readonly examSupervisorsService: ExamSupervisorsService) { }

  @Post()
  create(@Body() createExamSupervisorDto: CreateExamSupervisorDto) {
    return this.examSupervisorsService.create(createExamSupervisorDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('lecturer_code') lecturer_code?: string,
    @Query('exam_schedule_id') exam_schedule_id?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.examSupervisorsService.findAll({
      search,
      lecturer_code,
      exam_schedule_id,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }
  @Post('bulk')
  bulkCreate(@Body() dto: CreateExamSupervisorBulkDto) {
    return this.examSupervisorsService.bulkCreate(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examSupervisorsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateExamSupervisorDto: UpdateExamSupervisorDto) {
    return this.examSupervisorsService.update(id, updateExamSupervisorDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.examSupervisorsService.remove(id);
  }

  @Post('bulk-delete')
  removeMultiple(@Body('ids') ids: string[]) {
    return this.examSupervisorsService.removeMultiple(ids);
  }
}
