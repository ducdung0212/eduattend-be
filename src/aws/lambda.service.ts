import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LambdaClient,
  InvokeCommand,
  InvocationType,
} from '@aws-sdk/client-lambda';

// Khớp với DynamoDB Item trả về từ Lambda (partition key: rekognitionId)
export interface StudentInfo {
  rekognitionId: string;
  student_code: string;
}

// Khớp với response body Lambda trả về khi success:
// { success, message, data: { student, confidence, face_id, rekognition_result } }
export interface VerifyFaceResult {
  success: boolean;
  data?: {
    student: StudentInfo; // toàn bộ record từ DynamoDB
    confidence: number;   // Similarity từ Rekognition (0-100)
    face_id: string;      // FaceId trong Rekognition Collection
    rekognition_result: string
  };
  message: string;
}

@Injectable()
export class LambdaService {
  private readonly client: LambdaClient;
  private readonly functionName: string;
  private readonly logger = new Logger(LambdaService.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new LambdaClient({
      region: configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.functionName = configService.getOrThrow<string>(
      'AWS_LAMBDA_FACE_RECOGNITION',
    );
  }

  // ─── LUỒNG 2: Xác thực khuôn mặt điểm danh ──────────────────────────
  async verifyFace(
    imageBase64: string,
  ): Promise<VerifyFaceResult> {
    // Payload gửi lên Lambda: { image, examScheduleId }
    // Lambda đọc từ body.image (base64) và body.examScheduleId
    const payload = { image: imageBase64  };

    // this.logger.log(
    //   `Calling Lambda: ${this.functionName} | schedule: ${examScheduleId}`,
    // );

    // ── Gọi Lambda ───────────────────────────────────────────────────────
    let rawPayload: string;
    try {
      const command = new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: InvocationType.RequestResponse,
        Payload: Buffer.from(JSON.stringify(payload)),
      });

      const response = await this.client.send(command);

      // FunctionError: Lambda throw exception (khác với statusCode 4xx/5xx trong body)
      if (response.FunctionError) {
        const errBody = Buffer.from(response.Payload!).toString('utf-8');
        this.logger.error(`Lambda FunctionError: ${errBody}`);
        throw new InternalServerErrorException('Lỗi xử lý từ Lambda');
      }

      rawPayload = Buffer.from(response.Payload!).toString('utf-8');
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error('Lỗi gọi Lambda', error);
      throw new InternalServerErrorException('Không thể kết nối dịch vụ nhận diện');
    }

    // ── Parse response ────────────────────────────────────────────────────
    // Lambda trả về: { statusCode: number, headers: {...}, body: string }
    // body là JSON string cần parse lần 2
    let outerPayload: { statusCode: number; body: string };
    try {
      outerPayload = JSON.parse(rawPayload);
    } catch {
      this.logger.error(`Lambda trả về payload không hợp lệ: ${rawPayload}`);
      throw new InternalServerErrorException('Phản hồi từ Lambda không hợp lệ');
    }

    if (!outerPayload?.statusCode) {
      this.logger.error(`Lambda thiếu statusCode: ${rawPayload}`);
      throw new InternalServerErrorException('Định dạng phản hồi Lambda không hợp lệ');
    }

    // body trong Lambda Python luôn là string (json.dumps)
    let body: {
      success: boolean;
      message: string;
      data?: {
        student: StudentInfo;
        confidence: number;
        face_id: string;
        rekognition_result: string;
      };
    };
    try {
      body = typeof outerPayload.body === 'string'
        ? JSON.parse(outerPayload.body)
        : outerPayload.body;
    } catch {
      this.logger.error('Không parse được body từ Lambda');
      throw new InternalServerErrorException('Body phản hồi Lambda không hợp lệ');
    }

    this.logger.log(
      `Lambda statusCode: ${outerPayload.statusCode} | success: ${body?.success}`,
    );

    if (outerPayload.statusCode === 200 && body?.success === true) {
      return {
        success: true,
        data: {
          student: body.data!.student,
          confidence: body.data!.confidence,
          face_id: body.data!.face_id,
          rekognition_result: body.data!.rekognition_result
        },
        message: body.message,
      };
    }

    // statusCode 400 / 404 / 500 đều trả success: false kèm message
    return {
      success: false,
      message: body?.message ?? 'Xác thực thất bại',
    };
  }

  // ─── Test kết nối Lambda (DryRun không thực thi, chỉ kiểm tra permission) ──
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.client.send(
        new InvokeCommand({
          FunctionName: this.functionName,
          InvocationType: "DryRun",
        }),
      );
      return { success: true, message: 'Lambda function is accessible' };
    } catch (error) {
      this.logger.error('Lambda test connection failed', error);
      return { success: false, message: (error as Error).message };
    }
  }

  onModuleDestroy() {
    this.client.destroy();
  }
}