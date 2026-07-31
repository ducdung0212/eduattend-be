import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ExamPeriodsService } from './exam-periods.service';
import { CreateExamPeriodDto } from './dto/create-exam-period.dto';
import { UpdateExamPeriodDto } from './dto/update-exam-period.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('exam-periods')
export class ExamPeriodsController {
    constructor(private readonly examPeriodsService: ExamPeriodsService) {}

    @Post()
    create(@Body() createExamPeriodDto: CreateExamPeriodDto) {
        return this.examPeriodsService.create(createExamPeriodDto);
    }

    @Get()
    findAll(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.examPeriodsService.findAll({
            search,
            page: page ? +page : undefined,
            limit: limit ? +limit : undefined,
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.examPeriodsService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateExamPeriodDto: UpdateExamPeriodDto) {
        return this.examPeriodsService.update(id, updateExamPeriodDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.examPeriodsService.remove(id);
    }

    @Post('bulk-delete')
    removeMultiple(@Body('ids') ids: string[]) {
        return this.examPeriodsService.removeMultiple(ids);
    }
}
