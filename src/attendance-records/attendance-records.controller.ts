import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile, ParseFilePipe, FileTypeValidator, MaxFileSizeValidator } from '@nestjs/common';
import { AttendanceRecordsService } from './attendance-records.service';
import { CreateAttendanceRecordDto } from './dto/create-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { CheckInDto } from './dto/check-in.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'lecturer')
@Controller('attendance-records')
export class AttendanceRecordsController {
  constructor(private readonly attendanceRecordsService: AttendanceRecordsService) { }

  @Post()
  create(@Body() createAttendanceRecordDto: CreateAttendanceRecordDto) {
    return this.attendanceRecordsService.create(createAttendanceRecordDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendanceRecordsService.findAll({
      search,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }
  @Post('check-in')
  @UseInterceptors(FileInterceptor('image'))
  async checkIn(
    //@Body() body: CheckInDto,
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
}
