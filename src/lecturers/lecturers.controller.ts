import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, BadRequestException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { LecturersService } from './lecturers.service';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('lecturers')
export class LecturersController {
  constructor(private readonly lecturersService: LecturersService) { }

  @Post()
  create(@Body() createLecturerDto: CreateLecturerDto) {
    return this.lecturersService.create(createLecturerDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('faculty_code') faculty_code?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('is_has_photo') is_has_photo?: string,
  ) {
    const isHasPhoto = is_has_photo === 'true' ? true : is_has_photo === 'false' ? false : undefined;
    return this.lecturersService.findAll({ search, faculty_code, page: page ? +page : undefined, limit: limit ? +limit : undefined, is_has_photo: isHasPhoto });
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
    return this.lecturersService.importFromExcel(file.buffer, createAccount);
  }

  @Get(':lecturer_code')
  findOne(@Param('lecturer_code') lecturer_code: string) {
    return this.lecturersService.findOne(lecturer_code);
  }

  @Patch(':lecturer_code')
  update(@Param('lecturer_code') lecturer_code: string, @Body() updateLecturerDto: UpdateLecturerDto) {
    return this.lecturersService.update(lecturer_code, updateLecturerDto);
  }

  @Delete(':lecturer_code')
  remove(@Param('lecturer_code') lecturer_code: string) {
    return this.lecturersService.remove(lecturer_code);
  }


}
