import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/role.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import 'multer';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post() // POST /users
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get() // GET /users?search=...&role=...&page=1&limit=10
  findAll(
    @Query('search') search?: string,
    @Query('role') role?: 'admin' | 'lecturer' | 'student',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll({
      search,
      role,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get(':id') 
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id') 
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id') 
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post('bulk-delete')
  removeMultiple(@Body('ids') ids: string[]) {
    return this.usersService.removeMultiple(ids);
  }

  // @Post('import')
  // @UseInterceptors(FileInterceptor('file'))
  // async importUsers(@UploadedFile() file: Express.Multer.File) {
  //   if (!file) {
  //     throw new BadRequestException('Vui lòng chọn file Excel để import');
  //   }
  //   const allowedMimeTypes = [
  //     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  //     'application/vnd.ms-excel', // .xls
  //   ];
  //   if (!allowedMimeTypes.includes(file.mimetype) && !file.originalname.match(/\.(xlsx|xls)$/)) {
  //     throw new BadRequestException('Định dạng file không hợp lệ, vui lòng tải lên file Excel (.xlsx hoặc .xls)');
  //   }
  //   return this.usersService.importFromExcel(file.buffer);
  // }
}