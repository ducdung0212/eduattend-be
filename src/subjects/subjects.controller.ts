import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';


@UseGuards(JwtAuthGuard,RolesGuard)
@Roles('admin')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  create(@Body() createSubjectDto: CreateSubjectDto) {
    return this.subjectsService.create(createSubjectDto);
  }

  @Get()
  findAll(
    @Query('search') search?:string,
    @Query('page') page?:string,
    @Query('limit') limit?:string,
  ) {
    return this.subjectsService.findAll({search,page:page?+page:undefined,limit:limit?+limit:undefined});
  }

  @Get(':subject_code')
  findOne(@Param('subject_code') subject_code: string) {
    return this.subjectsService.findOne(subject_code);
  }

  @Patch(':subject_code')
  update(@Param('subject_code') subject_code: string, @Body() updateSubjectDto: UpdateSubjectDto) {
    return this.subjectsService.update(subject_code, updateSubjectDto);
  }

  @Delete(':subject_code')
  remove(@Param('subject_code') subject_code: string) {
    return this.subjectsService.remove(subject_code);
  }
}
