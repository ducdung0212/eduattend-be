import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExamSupervisorDto } from './dto/create-exam-supervisor.dto';
import { UpdateExamSupervisorDto } from './dto/update-exam-supervisor.dto';
import { Prisma } from '@prisma/client';

const EXAM_SUPERVISOR_SELECT: Prisma.ExamSupervisorSelect = {
  id: true,
  lecturer_code: true,
  exam_schedule_id: true,
  created_at: true,
  updated_at: true,
  lecturer: {
    select: {
      first_name: true,
      last_name: true,
      faculty_code: true,
    }
  },
  exam_schedule: {
    select: {
      subject_code: true,
      start_time: true,
      room_code: true,
    }
  }
};

@Injectable()
export class ExamSupervisorsService {
  constructor(private prisma: PrismaService) { }

  async create(createExamSupervisorDto: CreateExamSupervisorDto) {
    const existingRecord = await this.prisma.examSupervisor.findFirst({
      where: {
        lecturer_code: createExamSupervisorDto.lecturer_code,
        exam_schedule_id: createExamSupervisorDto.exam_schedule_id
      }
    });

    if (existingRecord) {
      throw new ConflictException("Giảng viên này đã được phân công coi thi cho ca thi này");
    }

    const lecturer = await this.prisma.lecturer.findUnique({
      where: { lecturer_code: createExamSupervisorDto.lecturer_code }
    });
    if (!lecturer) throw new NotFoundException("Không tìm thấy giảng viên");

    const schedule = await this.prisma.examSchedule.findUnique({
      where: { id: createExamSupervisorDto.exam_schedule_id }
    });
    if (!schedule) throw new NotFoundException("Không tìm thấy ca thi");

    const record = await this.prisma.examSupervisor.create({
      data: createExamSupervisorDto,
      select: EXAM_SUPERVISOR_SELECT
    });

    return {
      message: "Phân công coi thi thành công",
      data: record
    };
  }

  async findAll(query: {
    search?: string;
    lecturer_code?: string;
    exam_schedule_id?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { search, lecturer_code, exam_schedule_id } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.ExamSupervisorWhereInput = {
      ...(lecturer_code ? { lecturer_code } : {}),
      ...(exam_schedule_id ? { exam_schedule_id } : {}),
      ...(search ? {
        lecturer: {
          OR: [
            { lecturer_code: { contains: search, mode: 'insensitive' } },
            { first_name: { contains: search, mode: 'insensitive' } },
            { last_name: { contains: search, mode: 'insensitive' } },
          ]
        }
      } : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.examSupervisor.findMany({
        where,
        select: EXAM_SUPERVISOR_SELECT,
        orderBy: { created_at: 'desc' },
        take,
        skip
      }),
      this.prisma.examSupervisor.count({ where })
    ]);

    return {
      data: data,
      meta: {
        total,
        page,
        limit: take,
        totalPage: Math.ceil(total / take),
        hasNextPage: page < Math.ceil(total / take),
        hasPrevPage: page > 1
      }
    };
  }

  async findOne(id: string) {
    const record = await this.prisma.examSupervisor.findUnique({
      where: { id },
      select: EXAM_SUPERVISOR_SELECT
    });
    if (!record) {
      throw new NotFoundException(`Phân công coi thi ${id} không tồn tại`);
    }
    return record;
  }

  async update(id: string, updateExamSupervisorDto: UpdateExamSupervisorDto) {
    await this.findOne(id);

    if (updateExamSupervisorDto.lecturer_code) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: { lecturer_code: updateExamSupervisorDto.lecturer_code }
      });
      if (!lecturer) throw new NotFoundException("Không tìm thấy giảng viên");
    }

    const record = await this.prisma.examSupervisor.update({
      where: { id },
      data: updateExamSupervisorDto,
      select: EXAM_SUPERVISOR_SELECT
    });

    return {
      message: "Cập nhật phân công coi thi thành công",
      data: record
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.examSupervisor.delete({
      where: { id }
    });
    return {
      message: "Đã xóa thành công"
    };
  }
}
