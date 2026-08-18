import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Tạo tên hiển thị cho học kì */
function semesterDisplayName(semesterNumber: number, academicYear: string): string {
    return `Học kì ${semesterNumber} - Năm học ${academicYear}`;
}

const SEMESTER_SELECT = {
    id: true,
    academic_year: true,
    semester_number: true,
    start_date: true,
    end_date: true,
} as const;

@Injectable()
export class SemestersService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateSemesterDto) {
        const start = dayjs.utc(dto.start_date).startOf('day');
        const end = dayjs.utc(dto.end_date).startOf('day');

        if (end.isBefore(start)) {
            throw new BadRequestException('Ngày kết thúc thi phải sau hoặc bằng ngày bắt đầu thi');
        }

        if (![1, 2, 3].includes(dto.semester_number)) {
            throw new BadRequestException('Học kì chỉ nhận giá trị 1, 2 hoặc 3');
        }

        // Validate that dates are within the academic year
        const [startYearStr, endYearStr] = dto.academic_year.split('-');
        const startYear = parseInt(startYearStr, 10);
        const endYear = parseInt(endYearStr, 10);
        if (isNaN(startYear) || isNaN(endYear)) {
            throw new BadRequestException('Năm học không đúng định dạng (VD: 2025-2026)');
        }

        const currentYear = new Date().getFullYear();
        if (startYear < currentYear - 1 || startYear > currentYear) {
            throw new BadRequestException(`Chỉ có thể tạo mới học kì cho năm học ${currentYear - 1}-${currentYear} hoặc ${currentYear}-${currentYear + 1}`);
        }
        
        const minDate = dayjs(`${startYear}-01-01`).startOf('year');
        const maxDate = dayjs(`${endYear}-12-31`).endOf('year');

        if (start.isBefore(minDate) || start.isAfter(maxDate) || end.isBefore(minDate) || end.isAfter(maxDate)) {
            throw new BadRequestException(`Thời gian thi phải nằm trong khoảng năm ${startYear} đến năm ${endYear} của năm học ${dto.academic_year}`);
        }

        // Kiểm tra trùng (academic_year, semester_number)
        const existing = await this.prisma.semester.findUnique({
            where: {
                academic_year_semester_number: {
                    academic_year: dto.academic_year,
                    semester_number: dto.semester_number,
                },
            },
        });
        if (existing) {
            throw new ConflictException(
                `${semesterDisplayName(dto.semester_number, dto.academic_year)} đã tồn tại`,
            );
        }

        const semester = await this.prisma.semester.create({
            data: {
                academic_year: dto.academic_year,
                semester_number: dto.semester_number,
                start_date: start.toDate(),
                end_date: end.toDate(),
            },
            select: SEMESTER_SELECT,
        });

        return {
            message: `Thêm ${semesterDisplayName(dto.semester_number, dto.academic_year)} thành công`,
            data: semester,
        };
    }

    async findAll(query: { search?: string; page?: number; limit?: number } = {}) {
        const { search } = query;
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 100;

        const take = Math.min(limit, 100);
        const skip = (page - 1) * take;

        const where = {
            ...(search
                ? {
                      academic_year: { contains: search, mode: 'insensitive' as const },
                  }
                : {}),
        };

        const [data, total] = await Promise.all([
            this.prisma.semester.findMany({
                where,
                select: {
                    ...SEMESTER_SELECT,
                    _count: { select: { exam_schedules: true } },
                },
                orderBy: [
                    { academic_year: 'desc' },
                    { semester_number: 'asc' },
                ],
                take,
                skip,
            }),
            this.prisma.semester.count({ where }),
        ]);

        return {
            data: data.map(({ _count, ...rest }) => ({
                ...rest,
                name: semesterDisplayName(rest.semester_number, rest.academic_year),
                exam_schedule_count: _count.exam_schedules,
            })),
            meta: {
                total,
                page,
                limit: take,
                totalPages: Math.ceil(total / take),
                hasNextPage: page < Math.ceil(total / take),
                hasPrevPage: page > 1,
            },
        };
    }

    async findOne(id: string) {
        const semester = await this.prisma.semester.findUnique({
            where: { id },
            select: SEMESTER_SELECT,
        });
        if (!semester) {
            throw new NotFoundException('Không tìm thấy học kì');
        }
        return semester;
    }

    async update(id: string, dto: UpdateSemesterDto) {
        const currentSemester = await this.findOne(id);

        let targetStart = dayjs.utc(currentSemester.start_date);
        let targetEnd = dayjs.utc(currentSemester.end_date);

        if (dto.start_date) targetStart = dayjs.utc(dto.start_date);
        if (dto.end_date) targetEnd = dayjs.utc(dto.end_date);

        if (targetEnd.startOf('day').isBefore(targetStart.startOf('day'))) {
            throw new BadRequestException('Ngày kết thúc thi phải sau hoặc bằng ngày bắt đầu thi');
        }

        const targetAcademicYear = dto.academic_year ?? currentSemester.academic_year;
        const [startYearStr, endYearStr] = targetAcademicYear.split('-');
        const startYear = parseInt(startYearStr, 10);
        const endYear = parseInt(endYearStr, 10);
        
        if (isNaN(startYear) || isNaN(endYear)) {
            throw new BadRequestException('Năm học không đúng định dạng (VD: 2025-2026)');
        }

        const minDate = dayjs(`${startYear}-01-01`).startOf('year');
        const maxDate = dayjs(`${endYear}-12-31`).endOf('year');

        if (targetStart.isBefore(minDate) || targetStart.isAfter(maxDate) || targetEnd.isBefore(minDate) || targetEnd.isAfter(maxDate)) {
            throw new BadRequestException(`Thời gian thi phải nằm trong khoảng năm ${startYear} đến năm ${endYear} của năm học ${targetAcademicYear}`);
        }

        // Kiểm tra unique constraint nếu thay đổi academic_year hoặc semester_number
        if (dto.academic_year !== undefined || dto.semester_number !== undefined) {
            const targetYear = dto.academic_year ?? currentSemester.academic_year;
            const targetNumber = dto.semester_number ?? currentSemester.semester_number;

            const existing = await this.prisma.semester.findFirst({
                where: {
                    academic_year: targetYear,
                    semester_number: targetNumber,
                    id: { not: id },
                },
            });
            if (existing) {
                throw new ConflictException(
                    `${semesterDisplayName(targetNumber, targetYear)} đã tồn tại`,
                );
            }
        }

        // Kiểm tra xem có ca thi nào rơi ra ngoài khoảng thời gian mới không
        if (dto.start_date || dto.end_date) {
            const startOfDay = targetStart.startOf('day').toDate();
            const endOfDay = targetEnd.endOf('day').toDate();

            const outsideSchedules = await this.prisma.examSchedule.count({
                where: {
                    semester_id: id,
                    OR: [
                        { start_time: { lt: startOfDay } },
                        { start_time: { gt: endOfDay } }
                    ]
                }
            });

            if (outsideSchedules > 0) {
                throw new BadRequestException(
                    `Lỗi: Có ${outsideSchedules} ca thi thuộc học kì này đang có ngày thi nằm ngoài khoảng từ ${targetStart.format('DD/MM/YYYY')} đến ${targetEnd.format('DD/MM/YYYY')}. Vui lòng dời ngày các ca thi đó trước khi sửa học kì.`
                );
            }
        }

        const data: Record<string, any> = {};
        if (dto.academic_year !== undefined) data.academic_year = dto.academic_year;
        if (dto.semester_number !== undefined) data.semester_number = dto.semester_number;
        if (dto.start_date !== undefined) data.start_date = dayjs.utc(dto.start_date).startOf('day').toDate();
        if (dto.end_date !== undefined) data.end_date = dayjs.utc(dto.end_date).startOf('day').toDate();

        const semester = await this.prisma.semester.update({
            where: { id },
            data,
            select: SEMESTER_SELECT,
        });

        return {
            message: 'Cập nhật học kì thành công',
            data: semester,
        };
    }

    async remove(id: string) {
        await this.findOne(id);

        // Chặn xóa nếu còn ca thi
        const schedulesCount = await this.prisma.examSchedule.count({
            where: { semester_id: id }
        });

        if (schedulesCount > 0) {
            throw new ConflictException(`Không thể xóa học kì này vì đang có ${schedulesCount} ca thi.`);
        }

        await this.prisma.semester.delete({ where: { id } });

        return { message: 'Đã xóa học kì thành công' };
    }

    async removeMultiple(ids: string[]) {
        let success = 0;
        let failed = 0;
        const errors: any[] = [];

        for (const id of ids) {
            try {
                await this.remove(id);
                success++;
            } catch (error: any) {
                failed++;
                errors.push({ id, error: error.message });
            }
        }

        return {
            message: `Đã xoá thành công ${success} học kì, thất bại ${failed} học kì.`,
            data: { success, failed, errors }
        };
    }
}
