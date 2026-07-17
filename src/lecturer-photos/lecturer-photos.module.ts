import { Module } from '@nestjs/common';
import { LecturerPhotosService } from './lecturer-photos.service';
import { LecturerPhotosController } from './lecturer-photos.controller';
import { AwsModule } from '../aws/aws.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, AwsModule],
  controllers: [LecturerPhotosController],
  providers: [LecturerPhotosService],
})
export class LecturerPhotosModule {}
