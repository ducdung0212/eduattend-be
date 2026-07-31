import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UseInterceptors, UploadedFiles, BadRequestException, UploadedFile } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) { }

  @Post()
  create(@Body() createClassDto: CreateClassDto) {
    return this.classesService.create(createClassDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('faculty_code') faculty_code?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.classesService.findAll({ search, faculty_code, page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }
  @Post('import')
    @UseInterceptors(FileInterceptor('file'))
    async importClasses(
      @UploadedFile() file:Express.Multer.File
    ){
      if(!file){
        throw new BadRequestException('Vui lòng tải lên file Excel');
      }

      const allowedMimeTypes=[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
      ];

      if(!allowedMimeTypes.includes(file.mimetype)){
        throw new BadRequestException('Chỉ chấp nhận định dạng file Excel (.xlsx, xls');
      }

      return this.classesService.importFromExcel(file.buffer);
    }

  @Get(':class_code')
  findOne(@Param('class_code') class_code: string) {
    return this.classesService.findOne(class_code);
  }

  @Patch(':class_code')
  update(@Param('class_code') class_code: string, @Body() updateClassDto: UpdateClassDto) {
    return this.classesService.update(class_code, updateClassDto);
  }

  @Delete(':class_code')
  remove(@Param('class_code') class_code: string) {
    return this.classesService.remove(class_code);
  }

  @Post('bulk-delete')
  removeMultiple(@Body('ids') ids: string[]) {
    return this.classesService.removeMultiple(ids);
  }
}
