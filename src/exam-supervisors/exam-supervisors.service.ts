import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExamSupervisorDto } from './dto/create-exam-supervisor.dto';
import { UpdateExamSupervisorDto } from './dto/update-exam-supervisor.dto';
import { Prisma } from '@prisma/client';
import { CreateExamSupervisorBulkDto } from './dto/create-exam-supervisor-bulk.dto';
import dayjs from 'dayjs';


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

  /**
   * Kiểm tra giám thị có bị trùng giờ với ca thi khác không.
   * Nếu trùng → throw ConflictException.
   */
  private async checkSupervisorTimeConflict(
    lecturer_code: string,
    targetScheduleId: string,
  ) {
    // Lấy thông tin ca thi mục tiêu
    const targetSchedule = await this.prisma.examSchedule.findUnique({
      where: { id: targetScheduleId },
      select: { start_time: true, duration: true },
    });
    if (!targetSchedule) return;

    const newStart = dayjs(targetSchedule.start_time);
    const newEnd = newStart.add(targetSchedule.duration, 'minute');

    // Lấy tất cả ca thi mà giảng viên này đang coi (trừ ca thi mục tiêu)
    const otherSupervisedSchedules = await this.prisma.examSupervisor.findMany({
      where: {
        lecturer_code,
        exam_schedule_id: { not: targetScheduleId },
      },
      select: {
        exam_schedule: {
          select: {
            start_time: true,
            duration: true,
            subject: { select: { name: true } },
            room: { select: { name: true } },
          },
        },
      },
    });

    for (const sv of otherSupervisedSchedules) {
      const existingStart = dayjs(sv.exam_schedule.start_time);
      const existingEnd = existingStart.add(sv.exam_schedule.duration, 'minute');

      if (newStart.isBefore(existingEnd) && newEnd.isAfter(existingStart)) {
        const subjectName = sv.exam_schedule.subject?.name ?? '';
        const roomName = sv.exam_schedule.room?.name ?? '';
        const timeStr = existingStart.format('HH:mm DD/MM/YYYY');
        throw new ConflictException(
          `Giám thị đã được phân công coi thi "${subjectName}" tại ${roomName} lúc ${timeStr}, thời gian bị trùng`,
        );
      }
    }
  }

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

    const quantity=await this.prisma.examSupervisor.count({
      where:{
        exam_schedule_id:createExamSupervisorDto.exam_schedule_id
      }
    })
    if (quantity >= 4) {
      throw new ConflictException("Mỗi ca thi chỉ có thể có tối đa 4 giám thị");
    }

    const lecturer = await this.prisma.lecturer.findUnique({
      where: { lecturer_code: createExamSupervisorDto.lecturer_code }
    });
    if (!lecturer) throw new NotFoundException("Không tìm thấy giảng viên");

    const schedule = await this.prisma.examSchedule.findUnique({
      where: { id: createExamSupervisorDto.exam_schedule_id }
    });
    if (!schedule) throw new NotFoundException("Không tìm thấy ca thi");

    // Kiểm tra trùng giờ với các ca thi khác
    await this.checkSupervisorTimeConflict(
      createExamSupervisorDto.lecturer_code,
      createExamSupervisorDto.exam_schedule_id,
    );

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
        AND: search.split(/\s+/).filter(Boolean).map(term => ({
          lecturer: {
            OR: [
              { lecturer_code: { contains: term, mode: 'insensitive' } },
              { first_name: { contains: term, mode: 'insensitive' } },
              { last_name: { contains: term, mode: 'insensitive' } },
            ]
          }
        }))
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

    // Đếm số lượng giám thị HIỆN TẠI của ca thi để kiểm tra giới hạn (tối đa 4)
    const currentSupervisorCount = await this.prisma.examSupervisor.count({
      where: { exam_schedule_id }
    });
    let availableSlots = Math.max(0, 4 - currentSupervisorCount);

    // 5. Kiểm tra trùng giờ: Lấy thông tin ca thi mục tiêu + tất cả ca thi đang coi của các giảng viên
    const targetSchedule = await this.prisma.examSchedule.findUnique({
      where: { id: exam_schedule_id },
      select: { start_time: true, duration: true },
    });
    const newStart = dayjs(targetSchedule!.start_time);
    const newEnd = newStart.add(targetSchedule!.duration, 'minute');

    // Lấy tất cả phân công coi thi khác của các giảng viên hợp lệ (trừ ca thi hiện tại)
    const validLecturerCodes = Array.from(existingLecturerCodes).filter(c => !alreadyAssigned.has(c));
    const otherAssignments = validLecturerCodes.length > 0
      ? await this.prisma.examSupervisor.findMany({
          where: {
            lecturer_code: { in: validLecturerCodes },
            exam_schedule_id: { not: exam_schedule_id },
          },
          select: {
            lecturer_code: true,
            exam_schedule: {
              select: { start_time: true, duration: true, subject: { select: { name: true } }, room: { select: { name: true } } },
            },
          },
        })
      : [];

    // Nhóm theo lecturer_code để lookup nhanh
    const assignmentsByLecturer = new Map<string, typeof otherAssignments>();
    for (const a of otherAssignments) {
      if (!assignmentsByLecturer.has(a.lecturer_code)) {
        assignmentsByLecturer.set(a.lecturer_code, []);
      }
      assignmentsByLecturer.get(a.lecturer_code)!.push(a);
    }

    const success: { lecturer_code: string; id: string }[] = [];
    const failed: { lecturer_code: string; reason: string }[] = [];

    const toCreate: string[] = [];

    // 6. Phân loại kết quả
    for (const code of uniqueCodes) {
      if (!existingLecturerCodes.has(code)) {
        failed.push({ lecturer_code: code, reason: 'Không tìm thấy giảng viên' });
        continue;
      }
      if (alreadyAssigned.has(code)) {
        failed.push({ lecturer_code: code, reason: 'Đã được phân công coi thi ca này' });
        continue;
      }

      // Kiểm tra trùng giờ
      const lecturerAssignments = assignmentsByLecturer.get(code) ?? [];
      let hasConflict = false;
      for (const a of lecturerAssignments) {
        const existingStart = dayjs(a.exam_schedule.start_time);
        const existingEnd = existingStart.add(a.exam_schedule.duration, 'minute');
        if (newStart.isBefore(existingEnd) && newEnd.isAfter(existingStart)) {
          const subjectName = a.exam_schedule.subject?.name ?? '';
          const roomName = a.exam_schedule.room?.name ?? '';
          const timeStr = existingStart.format('HH:mm DD/MM/YYYY');
          failed.push({ lecturer_code: code, reason: `Trùng giờ với "${subjectName}" tại ${roomName} lúc ${timeStr}` });
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) continue;

      // Kiểm tra giới hạn 4 giám thị
      if (availableSlots <= 0) {
        failed.push({ lecturer_code: code, reason: 'Mỗi ca thi chỉ có thể có tối đa 4 giám thị' });
        continue;
      }

      toCreate.push(code);
      availableSlots--;
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
      message: `Đã xoá thành công ${success} phân công, thất bại ${failed} phân công.`,
      data: { success, failed, errors }
    };
  }
}
