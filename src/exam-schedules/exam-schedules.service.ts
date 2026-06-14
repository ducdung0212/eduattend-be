import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const EXAM_SCHEDULE_SELECT: Prisma.ExamScheduleSelect = {
  id: true,
  start_time: true,
  group: true,
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
    start_time?: string, // FE gửi dạng 'YYYY-MM-DD'
    page?: number,
    limit?: number,
  } = {}) {
    const { search, start_time } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

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
            // Ép chuỗi ngày từ FE về chuẩn múi giờ VN, sau đó lấy mốc đầu và cuối ngày
            gte: dayjs.tz(start_time, "Asia/Ho_Chi_Minh").startOf('day').toDate(),
            lte: dayjs.tz(start_time, "Asia/Ho_Chi_Minh").endOf('day').toDate(),
          }
        : undefined
    };

    const [data, total] = await Promise.all([
      this.prisma.examSchedule.findMany({
        where,
        select: EXAM_SCHEDULE_SELECT, // Cấu trúc select bạn đã định nghĩa
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
        totalPages: Math.ceil(total / take),
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

  async importFromExcel(fileBuffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const worksheet = workbook.worksheets[0];

    const getCellValue = (cell: ExcelJS.Cell): string => {
      const val = cell.value;
      if (val && typeof val === 'object') {
        if ('text' in val) return String((val as any).text);
        if ('richText' in val) return (val as any).richText.map((rt: any) => rt.text).join('');
      }
      return val ? String(val) : '';
    };

    // ── Pass 1: Đọc file ──────────────────────────────────────────
    // Cột Excel: subject_code | room_code | start_time | duration | group | note
    const errorRows: { row: number; error: string }[] = [];
    const rawRows: {
      rowNum: number;
      subject_code: string;
      room_code: string;
      start_time: Date;
      duration: number;
      group: number;
      note: string | null;
    }[] = [];

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.values || (row.values as any[]).length === 0) continue;

      const subject_code = getCellValue(row.getCell(1)).trim();
      const room_code = getCellValue(row.getCell(2)).trim();
      const exam_date = row.getCell(3).value; // ExcelJS trả về Date object
      const start_time = row.getCell(4).value; // ExcelJS trả về Date object (1900-01-01 HH:MM:SS)
      const duration = getCellValue(row.getCell(5)).trim();
      const group = getCellValue(row.getCell(6)).trim();
      const note = getCellValue(row.getCell(7)).trim() || null;

      const parsedGroup = Number(group);
      if (isNaN(parsedGroup) || parsedGroup <= 0) {
        errorRows.push({ row: i, error: `Nhóm '${group}' không hợp lệ` });
        continue;
      }
      // Validate bắt buộc
      if (!subject_code || !room_code || !start_time || !duration || !group) {
        errorRows.push({ row: i, error: 'Thiếu thông tin bắt buộc (mã môn, phòng, giờ thi, thời lượng, nhóm)' });
        continue;
      }

      let combinedDateTime: Date;

      if (exam_date instanceof Date) {
        let hours = 0, minutes = 0;

        if (start_time instanceof Date) {
          // ExcelJS trả về Date epoch cho time cell — lấy UTC hours/minutes
          hours = start_time.getUTCHours();
          minutes = start_time.getUTCMinutes();
        } else if (typeof start_time === 'string') {
          // Nếu cell là text "09:00" hoặc "9:00"
          const match = String(start_time).match(/^(\d{1,2}):(\d{2})/);
          if (match) {
            hours = Number(match[1]);
            minutes = Number(match[2]);
          } else {
            errorRows.push({ row: i, error: 'Giờ thi không đúng định dạng (HH:mm)' });
            continue;
          }
        } else {
          errorRows.push({ row: i, error: 'Giờ thi không đúng định dạng' });
          continue;
        }

        // 1. Lấy chuỗi ngày YYYY-MM-DD chính xác từ object exam_date (bỏ qua timezone của server)
        const dateStr = dayjs.utc(exam_date).format('YYYY-MM-DD');
        
        // 2. Chèn 0 vào trước giờ/phút nếu cần thiết để đảm bảo chuẩn ISO 8601
        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        
        // 3. Ghép thành chuỗi chuẩn ISO (vd: "2026-06-15T09:30:00")
        const dateTimeStr = `${dateStr}T${hh}:${mm}:00`;
        
        // 4. Áp dụng timezone VN và quy đổi về object Date thuần của JS để lưu DB
        combinedDateTime = dayjs.tz(dateTimeStr, "Asia/Ho_Chi_Minh").toDate();

      } else {
        errorRows.push({ row: i, error: 'Ngày thi không đúng định dạng' });
        continue;
      }

      // Validate duration là số dương
      const parsedDuration = Number(duration);
      if (isNaN(parsedDuration) || parsedDuration <= 0) {
        errorRows.push({ row: i, error: `Thời lượng '${duration}' không hợp lệ` });
        continue;
      }

      rawRows.push({ rowNum: i, subject_code, room_code, start_time: combinedDateTime, duration: parsedDuration, group: parsedGroup, note });
    }

    if (rawRows.length === 0) {
      return {
        message: 'Không có dữ liệu hợp lệ để import',
        data: {
          successCount: 0,
          errorCount: errorRows.length,
          errorMessages: errorRows.map(e => `Dòng ${e.row}: ${e.error}`)
        },
      };
    }

    // ── Pass 2: Batch-check FK 1 lần duy nhất ────────────────────
    const allSubjectCodes = [...new Set(rawRows.map(r => r.subject_code))];
    const allRoomCodes = [...new Set(rawRows.map(r => r.room_code))];

    const [validSubjects, validRooms] = await Promise.all([
      this.prisma.subject.findMany({
        where: { subject_code: { in: allSubjectCodes } },
        select: { subject_code: true },
      }),
      this.prisma.room.findMany({
        where: { room_code: { in: allRoomCodes } },
        select: { room_code: true },
      }),
    ]);

    const validSubjectSet = new Set(validSubjects.map(s => s.subject_code));
    const validRoomSet = new Set(validRooms.map(r => r.room_code));

    // ── Pass 3: Validate FK ───────────────────────────────────────
    const validRows = rawRows.filter(row => {
      if (!validSubjectSet.has(row.subject_code)) {
        errorRows.push({ row: row.rowNum, error: `Mã môn học '${row.subject_code}' không tồn tại` });
        return false;
      }
      if (!validRoomSet.has(row.room_code)) {
        errorRows.push({ row: row.rowNum, error: `Mã phòng '${row.room_code}' không tồn tại` });
        return false;
      }
      return true;
    });

    // ── Pass 4: createMany 1 query duy nhất ──────────────────────
    if (validRows.length > 0) {
      await this.prisma.examSchedule.createMany({
        data: validRows.map(({ rowNum, ...data }) => data),
      });
    }

    errorRows.sort((a, b) => a.row - b.row);
    const errorMessages = errorRows.map(e => `Dòng ${e.row}: ${e.error}`);

    return {
      message: errorRows.length > 0
        ? `Import hoàn tất với một số lỗi. Thành công: ${validRows.length} dòng. Thất bại: ${errorRows.length} dòng.`
        : `Import thành công toàn bộ ${validRows.length} dòng!`,
      data: {
        successCount: validRows.length,
        errorCount: errorRows.length,
        errorMessages,
        rawErrors: errorRows,
      },
    };
  }
}

