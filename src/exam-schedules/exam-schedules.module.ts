import { Module } from '@nestjs/common';
import { ExamSchedulesService } from './exam-schedules.service';
import { ExamSchedulesController } from './exam-schedules.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports:[PrismaModule],
  controllers: [ExamSchedulesController],
  providers: [ExamSchedulesService],
})
export class ExamSchedulesModule {}
