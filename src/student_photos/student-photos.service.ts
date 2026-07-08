import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfirmUploadResult, S3Service } from 'src/aws/s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { GenerateUploadUrlDto, GenerateUploadUrlItemDto } from './dto/generate-upload-url.dto';
import { ConfirmUploadItemDto } from './dto/confirm-upload.dto';

@Injectable()
export class StudentPhotosService {
    private readonly logger = new Logger(StudentPhotosService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3Service: S3Service,
    ) {}

    async generateUploadUrls(files: GenerateUploadUrlItemDto[]) {
        return this.s3Service.generateUploadUrls(files);
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

            let oldPhotos: { image_url: string }[] = [];
            try {
                oldPhotos = await this.prisma.studentPhoto.findMany({
                    where: { student_code: { in: codesToInsert } },
                    select: { image_url: true }
                });
            } catch (e) {
                this.logger.error("Lỗi khi truy xuất ảnh cũ", e);
            }

            try {
                await this.prisma.$transaction([
                    this.prisma.studentPhoto.deleteMany({
                        where: { student_code: { in: codesToInsert } },
                    }),
                    this.prisma.studentPhoto.createMany({
                        data: dbPayload
                    }),
                ]);

                // Xóa ảnh cũ trên S3 nếu khác url mới
                const newUrls = new Set(dbPayload.map(p => p.image_url));
                for (const old of oldPhotos) {
                    if (!newUrls.has(old.image_url)) {
                        const oldFileName = old.image_url.split('/').pop();
                        if (oldFileName) {
                            await this.s3Service.deleteUnconfirmedFile(oldFileName);
                        }
                    }
                }
            } catch (error) {
                this.logger.error("Lỗi khi ghi vào studentPhoto. Ràng buộc khoá ngoại (FK) thất bại?", error);
                
                // Rollback & dọn rác
                for (const row of rowsToInsert) {
                    await this.s3Service.deleteUnconfirmedFile(row.fileName);
                    const targetResult = finalResults.find(r => r.student_code === row.student_code);
                    if (targetResult) {
                        targetResult.success = false;
                        targetResult.message = 'Lỗi ràng buộc CSDL. Đã hoàn tác để bảo đảm an toàn dữ liệu.';
                    }
                }
            }
        }
        return finalResults;
    }
}