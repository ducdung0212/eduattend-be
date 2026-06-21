// student-photos/student-photos.module.ts
import { Module } from '@nestjs/common';
import { StudentPhotosService } from './student-photos.service';
import { StudentPhotosController } from './student-photos.controller';
import { AwsModule } from '../aws/aws.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule,AwsModule],
  controllers: [StudentPhotosController],
  providers: [StudentPhotosService],
})
export class StudentPhotosModule {}