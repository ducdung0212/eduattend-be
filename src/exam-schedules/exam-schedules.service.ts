import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import dayjs from 'dayjs';
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

  private async checkRoomAvailability(room_code:string,start_time:Date|string,duration:number,excludeScheduleId?:string){
    const newStart=dayjs(start_time);
    const newEnd=newStart.add(duration,'minute');

    const queryStart=newStart.subtract(1,'day').toDate();
    const queryEnd=newStart.add(1,'day').toDate();
    
    const existingSchedules=await this.prisma.examSchedule.findMany({
      where:{
        room_code:room_code,
        start_time:{
          gte:queryStart,
          lte:queryEnd,
        },
        ...(excludeScheduleId?{id:{not:excludeScheduleId}}:{})
      },
      select:{
        start_time:true,
        duration:true
      }
    })

    const isOverlap=existingSchedules.some(schedule=>{
      const existingStart=dayjs(schedule.start_time);
      const existingEnd=existingStart.add(schedule.duration,'minute');

      return newStart.isBefore(existingEnd) && newEnd.isAfter(existingStart);
    });
    if (isOverlap) {
      throw new ConflictException("Phòng thi này đã được xếp lịch trùng với thời gian bạn chọn");
    }
  }
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
    await this.checkRoomAvailability(
      createExamScheduleDto.room_code,
      createExamScheduleDto.start_time,
      createExamScheduleDto.duration
    )
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
    student_code?:string,
    lecturer_code?:string
  } = {}) {
    const { search, start_time, student_code,lecturer_code } = query;
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
            gte: dayjs.tz(start_time, "Asia/Ho_Chi_Minh").startOf('day').toDate(),
            lte: dayjs.tz(start_time, "Asia/Ho_Chi_Minh").endOf('day').toDate(),
          }
        : undefined,
        // Điều kiện lọc theo Sinh Viên (Lấy các ca thi mà sinh viên này có tên trong danh sách điểm danh)
      ...(student_code ? {
        attendance_records: {
          some: {
            student_code: student_code
          }
        }
      } : {}),

      // Điều kiện lọc theo Giám thị (Lấy các ca thi mà giảng viên này được phân công gác thi)
      ...(lecturer_code ? {
        exam_supervisors: {
          some: {
            lecturer_code: lecturer_code
          }
        }
      } : {})
    };

    const [rawExamSchedules, total] = await Promise.all([
      this.prisma.examSchedule.findMany({
        where,
        select: {
          ...EXAM_SCHEDULE_SELECT, 
          _count: {
            select: {
              attendance_records: true, 
              exam_supervisors: true,
            }
          }
        },
        skip,
        take,
        orderBy: {
          start_time: 'asc'
        }
      }),
      this.prisma.examSchedule.count({ where }),
    ]);

    const data = rawExamSchedules.map(schedule => {
      const { _count, ...scheduleData } = schedule; 
      return {
        ...scheduleData,
        attendance_count: _count?.attendance_records || 0,
        supervisor_count: _count?.exam_supervisors || 0,
      };
    });

    return {
      data, // Bây giờ data là 1 mảng đã gộp sẵn số lượng đếm bên trong từng object
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
      select: {id:true}
    })
    if (!examSchedule) {
      throw new NotFoundException("Không tìm thấy ca thi")
    }
    return examSchedule;
  }

  async update(id: string, updateExamScheduleDto: UpdateExamScheduleDto) {
    // Lấy thông tin ca thi hiện tại từ DB để đối chiếu
    const currentSchedule = await this.prisma.examSchedule.findUnique({
      where: { id }
    });
    
    if (!currentSchedule) {
      throw new NotFoundException("Không tìm thấy ca thi");
    }

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

    // TIẾN HÀNH KIỂM TRA TRÙNG LỊCH CHO UPDATE
    // Ưu tiên lấy data mới từ DTO, nếu DTO không truyền lên thì dùng data cũ
    const targetRoomCode = updateExamScheduleDto.room_code ?? currentSchedule.room_code;
    const targetStartTime = updateExamScheduleDto.start_time ?? currentSchedule.start_time;
    const targetDuration = updateExamScheduleDto.duration ?? currentSchedule.duration;

    // Chỉ check lại sự khả dụng nếu có tác động đến cấu hình phòng, thời gian thi hoặc thời lượng thi
    if (
      updateExamScheduleDto.room_code !== undefined || 
      updateExamScheduleDto.start_time !== undefined || 
      updateExamScheduleDto.duration !== undefined
    ) {
      // Nhớ truyền 'id' vào tham số thứ 4 để loại trừ chính ca thi này lúc kiểm tra DB
      await this.checkRoomAvailability(targetRoomCode, targetStartTime, targetDuration, id);
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

