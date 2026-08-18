import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile, ParseFilePipe, FileTypeValidator, MaxFileSizeValidator, BadRequestException } from '@nestjs/common';
import { AttendanceRecordsService } from './attendance-records.service';
import { CreateAttendanceRecordDto } from './dto/create-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { CheckInDto } from './dto/check-in.dto';
import { CheckInQrDto } from './dto/check-in-qr.dto';
import { CreateAttendanceRecordBulkDto } from './dto/create-attendance-record-bulk.dto';
import { ExamScheduleOwnerGuard } from 'src/common/guards/exam-schedule-owner.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('attendance-records')
export class AttendanceRecordsController {
  constructor(private readonly attendanceRecordsService: AttendanceRecordsService) { }

  @Post()
  create(@Body() createAttendanceRecordDto: CreateAttendanceRecordDto) {
    return this.attendanceRecordsService.create(createAttendanceRecordDto);
  }

  @Get()
  @Roles('admin', 'lecturer')
  @UseGuards(ExamScheduleOwnerGuard)
  findAll(
    @Query('search') search?: string,
    @Query('student_code') student_code?: string,
    @Query('exam_schedule_id') exam_schedule_id?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendanceRecordsService.findAll({
      search,
      student_code,
      exam_schedule_id,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get('check-room')
  @Roles('admin', 'lecturer')
  @UseGuards(ExamScheduleOwnerGuard)
  async checkRoom(
    @Query('student_code') student_code: string,
    @Query('exam_schedule_id') exam_schedule_id: string,
  ) {
    if (!student_code || !exam_schedule_id) {
      throw new BadRequestException("Thiếu student_code hoặc exam_schedule_id");
    }
    return this.attendanceRecordsService.checkStudentRoom(student_code, exam_schedule_id);
  }

  @Post('bulk')
  bulkCreate(@Body() dto: CreateAttendanceRecordBulkDto) {
    return this.attendanceRecordsService.bulkCreate(dto);
  }

  @Roles('admin', 'lecturer')
  @UseGuards(ExamScheduleOwnerGuard)
  @Post('import/:exam_schedule_id')
  @UseInterceptors(FileInterceptor('file'))
  async importFromExcel(
    @Param('exam_schedule_id') exam_schedule_id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: /excel|spreadsheetml/ }),
          new MaxFileSizeValidator({
            maxSize: 5 * 1024 * 1024, // 5MB
            message: 'File không được vượt quá 5MB',
          }),
        ],
      }),
    ) file: Express.Multer.File,
    @Body('force_capacity_override') force?: string,
  ) {
    return this.attendanceRecordsService.importFromExcel(
      file.buffer,
      exam_schedule_id,
      force === 'true'
    );
  }

  @Roles('admin', 'lecturer')
  @UseGuards(ExamScheduleOwnerGuard)
  @Post('check-in')
  @UseInterceptors(FileInterceptor('image'))
  async checkIn(
    @Body() checkInDto: CheckInDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: /image\/(jpeg|png)/ }),
          new MaxFileSizeValidator({
            maxSize: 5 * 1024 * 1024, // 5MB
            message: 'Ảnh không được vượt quá 5MB',
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.attendanceRecordsService.checkIn(
      file.buffer,
      checkInDto.exam_schedule_id
    );
  }

  @Roles('admin', 'lecturer')
  @UseGuards(ExamScheduleOwnerGuard)
  @Post('check-in/qr')
  async checkInQR(@Body() checkInQrDto: CheckInQrDto) {
    return this.attendanceRecordsService.checkInQR(
      checkInQrDto.student_code,
      checkInQrDto.exam_schedule_id
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.attendanceRecordsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAttendanceRecordDto: UpdateAttendanceRecordDto) {
    return this.attendanceRecordsService.update(id, updateAttendanceRecordDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.attendanceRecordsService.remove(id);
  }

  @Post('bulk-delete')
  removeMultiple(@Body('ids') ids: string[]) {
    return this.attendanceRecordsService.removeMultiple(ids);
  }
}
