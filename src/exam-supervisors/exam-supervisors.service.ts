import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExamSupervisorDto } from './dto/create-exam-supervisor.dto';
import { UpdateExamSupervisorDto } from './dto/update-exam-supervisor.dto';
import { Prisma } from '@prisma/client';
import { CreateExamSupervisorBulkDto } from './dto/create-exam-supervisor-bulk.dto';


const EXAM_SUPERVISOR_SELECT: Prisma.ExamSupervisorSelect = {
  id: true,
  created_at: true,
  updated_at: true,
  lecturer: {
    select: {
      lecturer_code: true,
      first_name: true,
      last_name: true,
      faculty: {
        select: {
          faculty_code: true,
          name:true,
        }
      },
    }
  },
  exam_schedule: {
    select: {
      id: true,
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
        totalPages: Math.ceil(total / take),
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

  async bulkCreate(dto: CreateExamSupervisorBulkDto) {
    const { exam_schedule_id, lecturer_codes } = dto;

    // 1. Loại trùng trong input
    const uniqueCodes = Array.from(new Set(lecturer_codes.map((c) => c.trim().toUpperCase())));

    // 2. Kiểm tra ca thi tồn tại
    const schedule = await this.prisma.examSchedule.findUnique({
      where: { id: exam_schedule_id },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy ca thi');

    // 3. Kiểm tra giảng viên tồn tại
    const lecturers = await this.prisma.lecturer.findMany({
      where: { lecturer_code: { in: uniqueCodes } },
      select: { lecturer_code: true },
    });
    
    // Đưa vào Set để kiểm tra O(1) ở vòng lặp bên dưới
    const existingLecturerCodes = new Set(lecturers.map((l) => l.lecturer_code));

    // 4. Kiểm tra đã được phân công chưa (TỐI ƯU: Chỉ đem các giảng viên có thật đi kiểm tra)
    const existingSupervisors = await this.prisma.examSupervisor.findMany({
      where: {
        exam_schedule_id,
        // Dùng Array.from để chuyển Set về mảng, giảm tải số lượng ID rác gửi xuống DB
        lecturer_code: { in: Array.from(existingLecturerCodes) }, 
      },
      select: { lecturer_code: true },
    });
    const alreadyAssigned = new Set(existingSupervisors.map((s) => s.lecturer_code));

    const success: { lecturer_code: string; id: string }[] = [];
    const failed: { lecturer_code: string; reason: string }[] = [];

    const toCreate: string[] = [];

    // 5. Phân loại kết quả
    for (const code of uniqueCodes) {
      if (!existingLecturerCodes.has(code)) {
        failed.push({ lecturer_code: code, reason: 'Không tìm thấy giảng viên' });
        continue;
      }
      if (alreadyAssigned.has(code)) {
        failed.push({ lecturer_code: code, reason: 'Đã được phân công coi thi ca này' });
        continue;
      }
      toCreate.push(code);
    }

    // 6. Thực hiện Transaction
    if (toCreate.length > 0) {
      await this.prisma.$transaction(
        toCreate.map((lecturer_code) =>
          this.prisma.examSupervisor.create({
            data: { lecturer_code, exam_schedule_id },
            select: { id: true, lecturer_code: true },
          }),
        ),
      ).then((created) => {
        created.forEach((c) => success.push({ lecturer_code: c.lecturer_code, id: c.id }));
      }).catch((err) => {
        // Nếu transaction fail toàn bộ, đánh dấu lỗi cho các code chưa xử lý
        toCreate.forEach((code) => {
          if (!success.find((s) => s.lecturer_code === code)) {
            failed.push({ lecturer_code: code, reason: 'Lỗi khi tạo bản ghi' });
          }
        });
      });
    }

    return {
      message: `Đã phân công ${success.length}/${uniqueCodes.length} giám thị`,
      data: {
        success,
        failed,
      }
    };
  }
}
