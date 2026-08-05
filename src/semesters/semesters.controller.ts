import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { SemestersService } from './semesters.service';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('semesters')
export class SemestersController {
    constructor(private readonly semestersService: SemestersService) {}

    @Post()
    create(@Body() createSemesterDto: CreateSemesterDto) {
        return this.semestersService.create(createSemesterDto);
    }

    @Get()
    @Roles('admin', 'lecturer', 'student')
    findAll(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.semestersService.findAll({
            search,
            page: page ? +page : undefined,
            limit: limit ? +limit : undefined,
        });
    }

    @Get(':id')
    @Roles('admin', 'lecturer', 'student')
    findOne(@Param('id') id: string) {
        return this.semestersService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateSemesterDto: UpdateSemesterDto) {
        return this.semestersService.update(id, updateSemesterDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.semestersService.remove(id);
    }

    @Post('bulk-delete')
    removeMultiple(@Body('ids') ids: string[]) {
        return this.semestersService.removeMultiple(ids);
    }
}
