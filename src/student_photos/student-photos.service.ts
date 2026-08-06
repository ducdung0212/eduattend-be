import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfirmUploadResult, S3Service, GenerateUploadUrlResult } from 'src/aws/s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { LambdaService } from 'src/aws/lambda.service';
import { GenerateUploadUrlDto, GenerateUploadUrlItemDto } from './dto/generate-upload-url.dto';
import { ConfirmUploadItemDto } from './dto/confirm-upload.dto';

@Injectable()
export class StudentPhotosService {
    private readonly logger = new Logger(StudentPhotosService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3Service: S3Service,
        private readonly lambdaService: LambdaService,
    ) {}

    async generateUploadUrls(files: GenerateUploadUrlItemDto[]): Promise<GenerateUploadUrlResult[]> {
        const parsedFiles = files.map(file => {
            const parsed = this.s3Service.parseUploadFileName(file.fileName, 'images_to_register');
            return { ...file, student_code: parsed?.student_code || '' };
        });

        const studentCodesToVerify = [...new Set(parsedFiles.map(f => f.student_code).filter(Boolean))];

        let existingStudents: { student_code: string }[] = [];
        if (studentCodesToVerify.length > 0) {
            try {
                existingStudents = await this.prisma.student.findMany({
                    where: { student_code: { in: studentCodesToVerify } },
                    select: { student_code: true },
                });
            } catch (dbErr) {
                this.logger.error("Lỗi khi truy vấn bảng student", dbErr);
                throw new InternalServerErrorException('Lỗi máy chủ khi kiểm tra dữ liệu sinh viên');
            }
        }

        const existingCodeSet = new Set(existingStudents.map((s) => s.student_code.toUpperCase()));

        const validFiles: GenerateUploadUrlItemDto[] = [];
        const results: GenerateUploadUrlResult[] = [];

        for (const file of parsedFiles) {
            if (!file.student_code) {
                results.push({
                    fileName: file.fileName,
                    success: false,
                    message: "Tên tệp không hợp lệ"
                });
                continue;
            }

            if (!existingCodeSet.has(file.student_code)) {
                results.push({
                    fileName: file.fileName,
                    success: false,
                    message: `Sinh viên chưa có trong hệ thống.`
                });
            } else {
                validFiles.push({
                    fileName: file.fileName,
                    fileType: file.fileType
                });
            }
        }

        if (validFiles.length > 0) {
            const s3Results = await this.s3Service.generateUploadUrls(validFiles);
            results.push(...s3Results);
        }

        return results;
    }

    async confirmUploads(uploads: ConfirmUploadItemDto[]): Promise<ConfirmUploadResult[]> {
        this.logger.debug(`[1] Bắt đầu xác nhận ${uploads.length} file từ S3`);
        const s3Results = await this.s3Service.confirmUploads(uploads);

        const successResults = s3Results.filter((r) => r.success && r.s3Url);

        if (successResults.length === 0) {
            return s3Results;
        }

        // Ép kiểu In Hoa toàn bộ để tránh lỗi case-sensitivity khi query DB
        const student_codes = [...new Set(successResults.map((r) => r.student_code.toUpperCase()))];

        let existingStudents: { student_code: string }[] = [];
        try {
            existingStudents = await this.prisma.student.findMany({
                where: { student_code: { in: student_codes } },
                select: { student_code: true },
            });
        } catch (dbErr) {
            this.logger.error("Lỗi khi truy vấn bảng student. Khả năng sai tên bảng hoặc rớt kết nối DB", dbErr);
            throw new InternalServerErrorException('Lỗi máy chủ khi kiểm tra dữ liệu sinh viên');
        }

        // Đảm bảo đưa vào Set cũng phải là In Hoa
        const existingCodeSet = new Set(existingStudents.map((s) => s.student_code.toUpperCase()));

        const finalResults: ConfirmUploadResult[] = [];
        const rowsToInsert: { student_code: string; image_url: string; fileName: string }[] = [];

        for (const result of s3Results) {
            if (!result.success || !result.s3Url) {
                finalResults.push(result);
                continue;
            }

            const currentCode = result.student_code.toUpperCase();

            // TRƯỜNG HỢP 1: Sinh viên chưa tồn tại trong Database
            if (!existingCodeSet.has(currentCode)) {
                await this.s3Service.deleteUnconfirmedFile(result.fileName);

                finalResults.push({
                    ...result,
                    success: false,
                    message: `Sinh viên ${currentCode} chưa có trong hệ thống. Đã hủy ảnh.`,
                });
                continue;
            }

            // TRƯỜNG HỢP 2: Sinh viên hợp lệ
            rowsToInsert.push({
                student_code: currentCode,
                image_url: result.s3Url,
                fileName: result.fileName,
            });

            finalResults.push({
                ...result,
                message: 'Đã lưu thông tin ảnh',
            });
        }

        // TRƯỜNG HỢP 3: Insert vào DB bằng Transaction
        if (rowsToInsert.length > 0) {
            const codesToInsert = rowsToInsert.map((r) => r.student_code);
            const dbPayload = rowsToInsert.map(r => ({
                student_code: r.student_code, 
                image_url: r.image_url 
            }));

            let oldPhotos: { student_code: string; image_url: string | null }[] = [];
            try {
                oldPhotos = await this.prisma.student.findMany({
                    where: { student_code: { in: codesToInsert } },
                    select: { student_code: true, image_url: true }
                });
            } catch (e) {
                this.logger.error("Lỗi khi truy xuất ảnh cũ", e);
            }

            try {
                const updatePromises = rowsToInsert.map(r => 
                    this.prisma.student.update({
                        where: { student_code: r.student_code },
                        data: { image_url: r.image_url }
                    })
                );
                await this.prisma.$transaction(updatePromises, {
                    timeout: 20000 // Tăng timeout lên 20 giây để tránh lỗi hết hạn
                });

                // Xóa dữ liệu khuôn mặt trên AWS (S3, Rekognition, DynamoDB)
                const newUrls = new Set(dbPayload.map(p => p.image_url));
                for (const old of oldPhotos) {
                    if (old.image_url && !newUrls.has(old.image_url)) {
                        this.lambdaService.deleteFaceData('student', old.student_code);
                    }
                }
            } catch (error) {
                this.logger.error("Lỗi khi update image_url cho student.", error);
                
                // Rollback & dọn rác
                for (const row of rowsToInsert) {
                    await this.s3Service.deleteUnconfirmedFile(row.fileName);
                    const targetResult = finalResults.find(r => r.student_code === row.student_code);
                    if (targetResult) {
                        targetResult.success = false;
                        targetResult.message = 'Lỗi DB. Đã hoàn tác để bảo đảm an toàn dữ liệu.';
                    }
                }
            }
        }
        return finalResults;
    }

    async deletePhoto(student_code: string): Promise<{ message: string }> {
        const student = await this.prisma.student.findUnique({
            where: { student_code },
            select: { image_url: true },
        });

        if (!student || !student.image_url) {
            return { message: 'Sinh viên này chưa có ảnh' };
        }

        const oldImageUrl = student.image_url;

        // Xóa ảnh trong DB (set về null)
        await this.prisma.student.update({
            where: { student_code },
            data: { image_url: null },
        });

        // Xóa dữ liệu khuôn mặt trên AWS Lambda (xóa luôn cả S3)
        this.lambdaService.deleteFaceData('student', student_code);

        return { message: 'Xóa ảnh sinh viên thành công' };
    }

    async deletePhotosMultiple(ids: string[]) {
        let success = 0;
        let failed = 0;
        const errors: any[] = [];

        for (const id of ids) {
            try {
                const res = await this.deletePhoto(id);
                if (res.message === 'Sinh viên này chưa có ảnh') {
                    // Cân nhắc xem chưa có ảnh thì là lỗi hay là success. Ta cho là thành công vì state cuối là ko có ảnh.
                    // Nhưng tuỳ nghiệp vụ. Ta coi là success.
                }
                success++;
            } catch (error: any) {
                failed++;
                errors.push({ id, error: error.message });
            }
        }

        return {
            message: `Đã xoá thành công ảnh của ${success} sinh viên, thất bại ${failed} sinh viên.`,
            data: { success, failed, errors }
        };
    }
}