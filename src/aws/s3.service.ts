import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface GenerateUploadUrlInput {
  fileName: string;
  fileType: 'image/jpeg' | 'image/png';
}

export interface GenerateUploadUrlResult {
  fileName: string;
  success: boolean;
  uploadUrl?: string;
  message?: string;
}

export interface ConfirmUploadInput {
  studentCode: string;
  fileName: string;
}

export interface ConfirmUploadResult {
  studentCode: string;
  fileName: string;
  success: boolean;
  s3Url?: string;
  message: string;
}

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region:string;
  private readonly logger=new Logger(S3Service.name);
  
  constructor(configService: ConfigService){
    this.region=configService.getOrThrow<string>('AWS_REGION');
    this.bucket=configService.getOrThrow<string>('AWS_BUCKET');

    this.client=new S3Client({
        region:this.region,
        credentials:{
            accessKeyId:configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
            secretAccessKey:configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
        },
    });
  }

//   private parseStudentFileName(fileName:string):{
//     student_code:string;
//     safeFileName:string;
//     s3Key:string;
//   }|null{
    
//   }
}