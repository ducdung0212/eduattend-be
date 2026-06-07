import { Module } from '@nestjs/common';
import { ExamSupervisorsService } from './exam-supervisors.service';
import { ExamSupervisorsController } from './exam-supervisors.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports:[PrismaModule],
  controllers: [ExamSupervisorsController],
  providers: [ExamSupervisorsService],
})
export class ExamSupervisorsModule {}
