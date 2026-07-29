import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AwsModule } from 'src/aws/aws.module';

@Module({
  imports: [PrismaModule, AwsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}

