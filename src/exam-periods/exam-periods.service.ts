import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateExamPeriodDto } from './dto/create-exam-period.dto';
import { UpdateExamPeriodDto } from './dto/update-exam-period.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const EXAM_PERIOD_SELECT = {
    id: true,
    name: true,
    start_date: true,
    end_date: true,
} as const;

@Injectable()
export class ExamPeriodsService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateExamPeriodDto) {
        const start = dayjs(dto.start_date);
        const end = dayjs(dto.end_date);

        if (end.isBefore(start)) {
            throw new BadRequestException('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
        }

        // Kiểm tra trùng tên
        const existing = await this.prisma.examPeriod.findFirst({
            where: { name: dto.name },
        });
        if (existing) {
            throw new ConflictException('Tên đợt thi đã tồn tại');
        }

        const examPeriod = await this.prisma.examPeriod.create({
            data: {
                name: dto.name,
                start_date: start.toDate(),
                end_date: end.toDate(),
            },
            select: EXAM_PERIOD_SELECT,
        });

        return {
            message: 'Thêm đợt thi thành công',
            data: examPeriod,
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
                      name: { contains: search, mode: 'insensitive' as const },
                  }
                : {}),
        };

        const [data, total] = await Promise.all([
            this.prisma.examPeriod.findMany({
                where,
                select: {
                    ...EXAM_PERIOD_SELECT,
                    _count: { select: { exam_schedules: true } },
                },
                orderBy: { start_date: 'desc' },
                take,
                skip,
            }),
            this.prisma.examPeriod.count({ where }),
        ]);

        return {
            data: data.map(({ _count, ...rest }) => ({
                ...rest,
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
        const examPeriod = await this.prisma.examPeriod.findUnique({
            where: { id },
            select: EXAM_PERIOD_SELECT,
        });
        if (!examPeriod) {
            throw new NotFoundException('Không tìm thấy đợt thi');
        }
        return examPeriod;
    }

    async update(id: string, dto: UpdateExamPeriodDto) {
        const currentPeriod = await this.findOne(id);

        let targetStart = dayjs(currentPeriod.start_date).tz('Asia/Ho_Chi_Minh');
        let targetEnd = dayjs(currentPeriod.end_date).tz('Asia/Ho_Chi_Minh');

        if (dto.start_date) targetStart = dayjs.tz(dto.start_date, 'Asia/Ho_Chi_Minh');
        if (dto.end_date) targetEnd = dayjs.tz(dto.end_date, 'Asia/Ho_Chi_Minh');

        if (targetEnd.startOf('day').isBefore(targetStart.startOf('day'))) {
            throw new BadRequestException('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
        }

        // Kiểm tra xem có ca thi nào rơi ra ngoài khoảng thời gian mới không
        if (dto.start_date || dto.end_date) {
            const startOfDay = targetStart.startOf('day').toDate();
            const endOfDay = targetEnd.endOf('day').toDate();

            const outsideSchedules = await this.prisma.examSchedule.count({
                where: {
                    exam_period_id: id,
                    OR: [
                        { start_time: { lt: startOfDay } },
                        { start_time: { gt: endOfDay } }
                    ]
                }
            });

            if (outsideSchedules > 0) {
                throw new BadRequestException(
                    `Lỗi: Có ${outsideSchedules} ca thi thuộc đợt này đang có ngày thi nằm ngoài khoảng từ ${targetStart.format('DD/MM/YYYY')} đến ${targetEnd.format('DD/MM/YYYY')}. Vui lòng dời ngày các ca thi đó trước khi sửa đợt thi.`
                );
            }
        }

        const data: Record<string, any> = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.start_date !== undefined) data.start_date = dayjs.tz(dto.start_date, 'Asia/Ho_Chi_Minh').startOf('day').toDate();
        if (dto.end_date !== undefined) data.end_date = dayjs.tz(dto.end_date, 'Asia/Ho_Chi_Minh').startOf('day').toDate();

        const examPeriod = await this.prisma.examPeriod.update({
            where: { id },
            data,
            select: EXAM_PERIOD_SELECT,
        });

        return {
            message: 'Cập nhật đợt thi thành công',
            data: examPeriod,
        };
    }

    async remove(id: string) {
        await this.findOne(id);

        // Chặn xóa nếu còn ca thi
        const schedulesCount = await this.prisma.examSchedule.count({
            where: { exam_period_id: id }
        });

        if (schedulesCount > 0) {
            throw new ConflictException(`Không thể xóa đợt thi này vì đang có ${schedulesCount} ca thi. Vui lòng gỡ hoặc xóa các ca thi bên trong trước.`);
        }

        await this.prisma.examPeriod.delete({ where: { id } });

        return { message: 'Đã xóa đợt thi thành công' };
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
            message: `Đã xoá thành công ${success} đợt thi, thất bại ${failed} đợt thi.`,
            data: { success, failed, errors }
        };
    }
}
