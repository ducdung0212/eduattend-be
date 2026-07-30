import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) { }

  @Post()
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('class_code') class_code?: string,
    @Query('faculty_code') faculty_code?: string,
    @Query('is_has_photo') is_has_photo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.studentsService.findAll({
      search,
      class_code,
      faculty_code,
      is_has_photo: is_has_photo === 'true' ? true : is_has_photo === 'false' ? false : undefined,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }
  @Post('import')
    @UseInterceptors(FileInterceptor('file'))
    async importLecturers(
      @UploadedFile() file: Express.Multer.File,
      @Body('create_account') createAccountStr: string
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
  
      // 3. Chuyển đổi create_account từ string (do FormData gửi lên) thành boolean
      const createAccount = createAccountStr === 'true';
  
      // 4. Gọi Service xử lý (Nhớ truyền file.buffer nhé)
      return this.studentsService.importFromExcel(file.buffer, createAccount);
    }


  @Get(':student_code')
  findOne(@Param('student_code') student_code: string) {
    return this.studentsService.findOne(student_code);
  }

  @Patch(':student_code')
  update(@Param('student_code') student_code: string, @Body() updateStudentDto: UpdateStudentDto) {
    return this.studentsService.update(student_code, updateStudentDto);
  }

  @Delete(':student_code')
  remove(@Param('student_code') student_code: string) {
    return this.studentsService.remove(student_code);
  }
}
