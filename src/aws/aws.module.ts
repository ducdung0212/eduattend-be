import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from './s3.service';
import { LambdaService } from './lambda.service';

@Module({
  imports: [ConfigModule],
  providers: [S3Service, LambdaService],
  exports: [S3Service, LambdaService],
})
export class AwsModule {}