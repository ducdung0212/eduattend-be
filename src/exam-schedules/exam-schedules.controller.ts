import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseInterceptors, UploadedFile, BadRequestException, UseGuards } from '@nestjs/common';
import { ExamSchedulesService } from './exam-schedules.service';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles('admin')
@Controller('exam-schedules')
export class ExamSchedulesController {
  constructor(private readonly examSchedulesService: ExamSchedulesService) { }

  @Post()
  create(@Body() createExamScheduleDto: CreateExamScheduleDto) {
    return this.examSchedulesService.create(createExamScheduleDto);
  }

  @Get()
  @Roles('admin', 'lecturer', 'student')
  findAll(
    @Query('search') search?: string,
    @Query('start_time') start_time?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('student_code') student_code?: string,
    @Query('lecturer_code') lecturer_code?: string,
    @Query('exam_period_id') exam_period_id?: string,
  ) {
    return this.examSchedulesService.findAll({
      search,
      start_time,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      student_code,
      lecturer_code,
      exam_period_id,
    });
  }

  @Get('ongoing')
  @Roles('admin', 'lecturer')
  findOngoing(
    @Query('search') search?: string,
    @Query('exam_period_id') exam_period_id?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('lecturer_code') lecturer_code?:string,
  ) {
    return this.examSchedulesService.findOngoing({ 
      search, 
      exam_period_id,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      lecturer_code:lecturer_code?lecturer_code:undefined
    });
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importExamSchedules(
    @UploadedFile() file: Express.Multer.File,
    @Body('exam_period_id') exam_period_id: string,
  ) {
    // 1. Validate xem người dùng có gửi file lên không
    if (!file) {
      throw new BadRequestException('Vui lòng tải lên file Excel');
    }

    // 2. Validate định dạng file (chỉ cho phép .xlsx hoặc .xls)
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ chấp nhận định dạng file Excel (.xlsx, .xls)');
    }

    if (!exam_period_id) {
      throw new BadRequestException('Vui lòng chọn đợt thi');
    }

    return this.examSchedulesService.importFromExcel(file.buffer, exam_period_id);
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

  @Post('bulk-delete')
  removeMultiple(@Body('ids') ids: string[]) {
    return this.examSchedulesService.removeMultiple(ids);
  }
}
