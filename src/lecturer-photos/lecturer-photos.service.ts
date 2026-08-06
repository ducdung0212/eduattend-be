import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfirmUploadResult, S3Service, GenerateUploadUrlResult } from 'src/aws/s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { LambdaService } from 'src/aws/lambda.service';
import { GenerateLecturerUploadUrlItemDto } from './dto/generate-upload-url.dto';
import { ConfirmLecturerUploadItemDto } from './dto/confirm-upload.dto';

@Injectable()
export class LecturerPhotosService {
    private readonly logger = new Logger(LecturerPhotosService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3Service: S3Service,
        private readonly lambdaService: LambdaService,
    ) {}

    async generateUploadUrls(files: GenerateLecturerUploadUrlItemDto[]): Promise<GenerateUploadUrlResult[]> {
        const parsedFiles = files.map(file => {
            const parsed = this.s3Service.parseUploadFileName(file.fileName, 'lecturer_images');
            return { ...file, lecturer_code: parsed?.student_code || '', folder: 'lecturer_images' };
        });

        const lecturerCodesToVerify = [...new Set(parsedFiles.map(f => f.lecturer_code).filter(Boolean))];

        let existingLecturers: { lecturer_code: string }[] = [];
        if (lecturerCodesToVerify.length > 0) {
            try {
                existingLecturers = await this.prisma.lecturer.findMany({
                    where: { lecturer_code: { in: lecturerCodesToVerify } },
                    select: { lecturer_code: true },
                });
            } catch (dbErr) {
                this.logger.error('Lỗi khi truy vấn bảng lecturer', dbErr);
                throw new InternalServerErrorException('Lỗi máy chủ khi kiểm tra dữ liệu giảng viên');
            }
        }

        const existingCodeSet = new Set(existingLecturers.map((s) => s.lecturer_code.toUpperCase()));

        const validFiles: { fileName: string; fileType: "image/jpeg" | "image/png"; folder: string }[] = [];
        const results: GenerateUploadUrlResult[] = [];

        for (const file of parsedFiles) {
            if (!file.lecturer_code) {
                results.push({
                    fileName: file.fileName,
                    success: false,
                    message: "Tên tệp không hợp lệ"
                });
                continue;
            }

            if (!existingCodeSet.has(file.lecturer_code)) {
                results.push({
                    fileName: file.fileName,
                    success: false,
                    message: `Giảng viên chưa có trong hệ thống.`
                });
            } else {
                validFiles.push({
                    fileName: file.fileName,
                    fileType: file.fileType as "image/jpeg" | "image/png",
                    folder: 'lecturer_images'
                });
            }
        }

        if (validFiles.length > 0) {
            const s3Results = await this.s3Service.generateUploadUrls(validFiles);
            results.push(...s3Results);
        }

        return results;
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

            let oldPhotos: { lecturer_code: string; image_url: string | null }[] = [];
            try {
                oldPhotos = await this.prisma.lecturer.findMany({
                    where: { lecturer_code: { in: codesToInsert } },
                    select: { lecturer_code: true, image_url: true }
                });
            } catch (e) {
                this.logger.error("Lỗi khi truy xuất ảnh cũ", e);
            }

            try {
                const updatePromises = rowsToInsert.map(r => 
                    this.prisma.lecturer.update({
                        where: { lecturer_code: r.lecturer_code },
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
                        this.lambdaService.deleteFaceData('lecturer', old.lecturer_code);
                    }
                }
            } catch (error) {
                this.logger.error("Lỗi khi update image_url cho lecturer.", error);
                
                // Rollback & dọn rác
                for (const row of rowsToInsert) {
                    await this.s3Service.deleteUnconfirmedFile(row.fileName, 'lecturer_images');
                    const targetResult = finalResults.find(r => r.student_code === row.lecturer_code);
                    if (targetResult) {
                        targetResult.success = false;
                        targetResult.message = 'Lỗi DB. Đã hoàn tác để bảo đảm an toàn dữ liệu.';
                    }
                }
            }
        }
        return finalResults;
    }

    async deletePhoto(lecturer_code: string): Promise<{ message: string }> {
        const lecturer = await this.prisma.lecturer.findUnique({
            where: { lecturer_code },
            select: { image_url: true },
        });

        if (!lecturer || !lecturer.image_url) {
            return { message: 'Giảng viên này chưa có ảnh' };
        }

        const oldImageUrl = lecturer.image_url;

        // Xóa record trong DB
        await this.prisma.lecturer.update({
            where: { lecturer_code },
            data: { image_url: null },
        });

        // Xóa dữ liệu khuôn mặt trên AWS Lambda (xóa luôn S3)
        this.lambdaService.deleteFaceData('lecturer', lecturer_code);

        return { message: 'Xóa ảnh giảng viên thành công' };
    }

    async deletePhotosMultiple(ids: string[]) {
        let success = 0;
        let failed = 0;
        const errors: any[] = [];

        for (const id of ids) {
            try {
                const res = await this.deletePhoto(id);
                if (res.message === 'Giảng viên này chưa có ảnh') {
                    // Cân nhắc xem chưa có ảnh thì là lỗi hay là success. Ta cho là thành công.
                }
                success++;
            } catch (error: any) {
                failed++;
                errors.push({ id, error: error.message });
            }
        }

        return {
            message: `Đã xoá thành công ảnh của ${success} giảng viên, thất bại ${failed} giảng viên.`,
            data: { success, failed, errors }
        };
    }
}
