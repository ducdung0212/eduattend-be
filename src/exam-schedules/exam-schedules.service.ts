import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

const EXAM_SCHEDULE_SELECT: Prisma.ExamScheduleSelect = {
  id: true,
  start_time: true,
  duration: true,
  note: true,
  subject: {
    select: {
      subject_code: true,
      name: true
    }
  },
  room: {
    select: {
      room_code: true,
      name: true
    }
  }
};

@Injectable()
export class ExamSchedulesService {
  constructor(private prisma: PrismaService) { }
  async create(createExamScheduleDto: CreateExamScheduleDto) {
    const existingSubject = await this.prisma.subject.findUnique({
      where: { subject_code: createExamScheduleDto.subject_code }
    })
    const existingRoom = await this.prisma.room.findUnique({
      where: { room_code: createExamScheduleDto.room_code }
    })
    if (!existingSubject) {
      throw new NotFoundException("Không tồn tại môn học")
    }
    if (!existingRoom) {
      throw new NotFoundException("Không tồn tại phòng")
    }
    const examSchedule = await this.prisma.examSchedule.create({
      data: createExamScheduleDto,
      select: EXAM_SCHEDULE_SELECT
    })
    return {
      message: "Thêm ca thi thành công",
      data: examSchedule
    }
  }

  async findAll(query: {
    search?: string,
    start_time?: string,
    page?: number,
    limit?: number,
  } = {}) {
    const { search, start_time } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    // Vì Front-end gửi lên ngày theo múi giờ Việt Nam (ví dụ: '2026-06-15')
    // Nên ta phải trừ đi 7 tiếng (từ đoạn 00:00:00) theo giờ UTC để lấy kẹp đúng ngày VN
    const where: Prisma.ExamScheduleWhereInput = {
      ...(search ? {
        OR: [
          { subject_code: { contains: search, mode: 'insensitive' } },
          { subject: { name: { contains: search, mode: 'insensitive' } } },
          { room_code: { contains: search, mode: 'insensitive' } },
          { room: { name: { contains: search, mode: 'insensitive' } } }
        ]
      } : {}),
      start_time: start_time
        ? {
          gte: new Date(`${start_time}T00:00:00.000+07:00`),
          lte: new Date(`${start_time}T23:59:59.999+07:00`)
        }
        : undefined
    };

    const [data, total] = await Promise.all([
      this.prisma.examSchedule.findMany({
        where,
        select: EXAM_SCHEDULE_SELECT,
        skip,
        take,
        orderBy: {
          start_time: 'asc'
        }
      }),
      this.prisma.examSchedule.count({ where })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        total_pages: Math.ceil(total / take),
        hasNextPage: page < Math.ceil(total / take),
        hasPrevPage: page > 1,
      }
    };
  }

  async findOne(id: string) {
    const examSchedule = await this.prisma.examSchedule.findUnique({
      where: { id },
      select: EXAM_SCHEDULE_SELECT
    })
    if (!examSchedule) {
      throw new NotFoundException("Không tìm thấy ca thi")
    }
    return examSchedule;
  }

  async update(id: string, updateExamScheduleDto: UpdateExamScheduleDto) {
    await this.findOne(id);

    if (updateExamScheduleDto.subject_code) {
      const existingSubject = await this.prisma.subject.findUnique({
        where: { subject_code: updateExamScheduleDto.subject_code }
      });
      if (!existingSubject) throw new NotFoundException("Không tồn tại môn học");
    }

    if (updateExamScheduleDto.room_code) {
      const existingRoom = await this.prisma.room.findUnique({
        where: { room_code: updateExamScheduleDto.room_code }
      });
      if (!existingRoom) throw new NotFoundException("Không tồn tại phòng");
    }

    const examSchedule = await this.prisma.examSchedule.update({
      where: { id },
      data: updateExamScheduleDto,
      select: EXAM_SCHEDULE_SELECT
    });

    return {
      message: "Cập nhật lịch thi thành công",
      data: examSchedule
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.examSchedule.delete({
      where: { id }
    })
    return {
      message: "Đã xóa thành công ca thi"
    }
  }
}

