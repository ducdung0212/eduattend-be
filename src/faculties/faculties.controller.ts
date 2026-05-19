import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { FacultiesService } from './faculties.service';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';

@Controller('faculties')
export class FacultiesController {
  constructor(private readonly facultiesService: FacultiesService) { }

  @Post()
  create(@Body() createFacultyDto: CreateFacultyDto) {
    return this.facultiesService.create(createFacultyDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.facultiesService.findAll({
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Get(':faculty_code')
  findOne(@Param('faculty_code') faculty_code: string) {
    return this.facultiesService.findOne(faculty_code);
  }

  @Patch(':faculty_code')
  update(@Param('faculty_code') faculty_code: string, @Body() updateFacultyDto: UpdateFacultyDto) {
    return this.facultiesService.update(faculty_code, updateFacultyDto);
  }

  @Delete(':faculty_code')
  remove(@Param('faculty_code') faculty_code: string) {
    return this.facultiesService.remove(faculty_code);
  }
}