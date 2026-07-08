import { Module } from '@nestjs/common';
import { ExamPeriodsService } from './exam-periods.service';
import { ExamPeriodsController } from './exam-periods.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ExamPeriodsController],
    providers: [ExamPeriodsService],
})
export class ExamPeriodsModule {}
