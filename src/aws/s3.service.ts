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
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface GenerateUploadUrlInput {
  fileName: string;
  fileType: 'image/jpeg' | 'image/png';
  folder?: string;
}

export interface GenerateUploadUrlResult {
  fileName: string;
  success: boolean;
  uploadUrl?: string;
  message?: string;
}

export interface ConfirmUploadInput {
  student_code: string;
  fileName: string;
  folder?: string;
}

export interface ConfirmUploadResult {
  student_code: string;
  fileName: string;
  success: boolean;
  s3Url?: string;
  message: string;
}

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(configService: ConfigService) {
    this.region = configService.getOrThrow<string>('AWS_REGION');
    this.bucket = configService.getOrThrow<string>('AWS_BUCKET');

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  private parseUploadFileName(fileName: string, folder: string = 'images_to_register'): {
    student_code: string;
    safeFileName: string;
    s3Key: string;
  } | null {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return null;

    const student_code = fileName.substring(0, lastDot);
    const extension = fileName.substring(lastDot + 1).toLowerCase();

    const validCode = /^[A-Za-z0-9_-]+$/.test(student_code);
    const validExt = ['jpg', 'jpeg', 'png'].includes(extension);

    if (!validCode || !validExt) return null;

    const safeFileName = fileName.replace(/[^A-Za-z0-9_.-]/g, '_');
    const s3Key = `${folder}/${safeFileName}`;

    return { student_code: student_code.toUpperCase(), safeFileName, s3Key };
  }

  async generateUploadUrls(
    files: GenerateUploadUrlInput[],
  ): Promise<GenerateUploadUrlResult[]> {
    const promises = files.map(async (file) => {
      const folder = file.folder || 'images_to_register';
      const parsed = this.parseUploadFileName(file.fileName, folder);

      if (!parsed) {
        return {
          fileName: file.fileName,
          success: false,
          message: 'Tên tệp phải có định dạng (DH/LT)xxxxxxxx và định dạng ảnh hợp lệ (jpg/jpeg/png).'
        };
      }

      try {
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: parsed.s3Key,
          ContentType: file.fileType,
        });

        const uploadUrl = await getSignedUrl(this.client, command, {
          expiresIn: 15 * 60,
        });

        this.logger.log(`Generated presigned URL for: ${parsed.s3Key}`);
        return {
          fileName: file.fileName,
          success: true,
          uploadUrl,
        };
      } catch (error) {
        this.logger.error(`Lỗi tạo presigned URL cho ${file.fileName}`, error);
        return {
          fileName: file.fileName,
          success: false,
          message: 'Không thể tạo URL upload',
        };
      }
    });

    return Promise.all(promises);
  }

  async confirmUploads(
    uploads: ConfirmUploadInput[],
  ): Promise<ConfirmUploadResult[]> {
    const promises = uploads.map(async (upload) => {
      const folder = upload.folder || 'images_to_register';
      const parsed = this.parseUploadFileName(upload.fileName, folder);

      if (!parsed) {
        return {
          student_code: upload.student_code,
          fileName: upload.fileName,
          success: false,
          message: 'Tên tệp không hợp lệ'
        };
      }

      if (parsed.student_code !== upload.student_code.toUpperCase()) {
        return {
          student_code: upload.student_code,
          fileName: upload.fileName,
          success: false,
          message: 'Mã sinh viên không khớp với tên file',
        };
      }

      try {
        await this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: parsed.s3Key,
          })
        );
        const s3Url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${parsed.s3Key}`;

        this.logger.log(`Confirmed S3 upload: ${parsed.s3Key}`);
        return {
          student_code: upload.student_code.toUpperCase(),
          fileName: upload.fileName,
          success: true,
          s3Url,
          message: 'Ảnh đã được upload lên S3',
        };
      } catch (error: any) {
        if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
          return {
            student_code: upload.student_code,
            fileName: upload.fileName,
            success: false,
            message: 'Ảnh chưa được upload lên S3',
          };
        } else {
          this.logger.error(`Lỗi kiểm tra S3 cho ${upload.fileName}`, error);
          return {
            student_code: upload.student_code,
            fileName: upload.fileName,
            success: false,
            message: 'Lỗi kiểm tra S3',
          };
        }
      }
    });

    return Promise.all(promises);
  }

  // Hàm nhận vào fileName, tự phân tích ra s3Key để xóa ảnh rác
  async deleteUnconfirmedFile(fileName: string, folder: string = 'images_to_register'): Promise<void> {
    const parsed = this.parseUploadFileName(fileName, folder);
    
    if (!parsed) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: parsed.s3Key,
        })
      );
      this.logger.log(`Đã dọn dẹp ảnh rác trên S3: ${parsed.s3Key}`);
    } catch (error) {
      this.logger.error(`Lỗi không thể xóa ảnh rác trên S3: ${parsed.s3Key}`, error);
    }
  }

  onModuleDestroy() {
    this.client.destroy();
  }
}