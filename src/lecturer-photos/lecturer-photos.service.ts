import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfirmUploadResult, S3Service } from 'src/aws/s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { GenerateLecturerUploadUrlItemDto } from './dto/generate-upload-url.dto';
import { ConfirmLecturerUploadItemDto } from './dto/confirm-upload.dto';

@Injectable()
export class LecturerPhotosService {
    private readonly logger = new Logger(LecturerPhotosService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3Service: S3Service,
    ) {}

    async generateUploadUrls(files: GenerateLecturerUploadUrlItemDto[]) {
        const payload = files.map(f => ({ ...f, folder: 'lecturer_images' }));
        return this.s3Service.generateUploadUrls(payload);
    }

    async confirmUploads(uploads: ConfirmLecturerUploadItemDto[]): Promise<ConfirmUploadResult[]> {
        this.logger.debug(`[1] Bắt đầu xác nhận ${uploads.length} file từ S3 cho giảng viên`);
        const confirmPayload = uploads.map(u => ({
            student_code: u.lecturer_code, // s3 service is reusing this field
            fileName: u.fileName,
            folder: 'lecturer_images'
        }));

        const s3Results = await this.s3Service.confirmUploads(confirmPayload);

        const successResults = s3Results.filter((r) => r.success && r.s3Url);

        if (successResults.length === 0) {
            return s3Results;
        }

        const lecturer_codes = [...new Set(successResults.map((r) => r.student_code.toUpperCase()))];

        let existingLecturers: { lecturer_code: string }[] = [];
        try {
            existingLecturers = await this.prisma.lecturer.findMany({
                where: { lecturer_code: { in: lecturer_codes } },
                select: { lecturer_code: true },
            });
        } catch (dbErr) {
            this.logger.error('Lỗi khi truy vấn bảng lecturer', dbErr);
            throw new InternalServerErrorException('Lỗi máy chủ khi kiểm tra dữ liệu giảng viên');
        }

        const existingCodeSet = new Set(existingLecturers.map((s) => s.lecturer_code.toUpperCase()));

        const finalResults: ConfirmUploadResult[] = [];
        const rowsToInsert: { lecturer_code: string; image_url: string; fileName: string }[] = [];

        for (const result of s3Results) {
            if (!result.success || !result.s3Url) {
                finalResults.push(result);
                continue;
            }

            const currentCode = result.student_code.toUpperCase();

            // TRƯỜNG HỢP 1: Giảng viên chưa tồn tại trong Database
            if (!existingCodeSet.has(currentCode)) {
                await this.s3Service.deleteUnconfirmedFile(result.fileName, 'lecturer_images');

                finalResults.push({
                    ...result,
                    success: false,
                    message: `Giảng viên ${currentCode} chưa có trong hệ thống. Đã hủy ảnh.`,
                });
                continue;
            }

            // TRƯỜNG HỢP 2: Giảng viên hợp lệ
            rowsToInsert.push({
                lecturer_code: currentCode,
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
            const codesToInsert = rowsToInsert.map((r) => r.lecturer_code);
            const dbPayload = rowsToInsert.map(r => ({
                lecturer_code: r.lecturer_code, 
                image_url: r.image_url 
            }));

            let oldPhotos: { image_url: string }[] = [];
            try {
                oldPhotos = await this.prisma.lecturerPhoto.findMany({
                    where: { lecturer_code: { in: codesToInsert } },
                    select: { image_url: true }
                });
            } catch (e) {
                this.logger.error('Lỗi khi truy xuất ảnh cũ', e);
            }

            try {
                await this.prisma.$transaction([
                    this.prisma.lecturerPhoto.deleteMany({
                        where: { lecturer_code: { in: codesToInsert } },
                    }),
                    this.prisma.lecturerPhoto.createMany({
                        data: dbPayload
                    }),
                ]);

                // Xóa ảnh cũ trên S3 nếu khác url mới
                const newUrls = new Set(dbPayload.map(p => p.image_url));
                for (const old of oldPhotos) {
                    if (!newUrls.has(old.image_url)) {
                        const oldFileName = old.image_url.split('/').pop();
                        if (oldFileName) {
                            await this.s3Service.deleteUnconfirmedFile(oldFileName, 'lecturer_images');
                        }
                    }
                }
            } catch (error) {
                this.logger.error('Lỗi khi ghi vào lecturerPhoto.', error);
                
                // Rollback & dọn rác
                for (const row of rowsToInsert) {
                    await this.s3Service.deleteUnconfirmedFile(row.fileName, 'lecturer_images');
                    const targetResult = finalResults.find(r => r.student_code === row.lecturer_code);
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
