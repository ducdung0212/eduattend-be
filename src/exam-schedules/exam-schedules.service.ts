import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
      name: true,
      semester: true,
    }
  },
  room: {
    select: {
      room_code: true,
      name: true
    }
  },
  semester: {
    select: {
      id: true,
      academic_year: true,
      semester_number: true,
      start_date: true,
      end_date: true,
    }
  }
};

@Injectable()
export class ExamSchedulesService {
  constructor(private prisma: PrismaService) { }

  private async checkRoomAvailability(room_code: string, start_time: Date | string, duration: number, excludeScheduleId?: string) {
    const newStart = dayjs(start_time);
    const newEnd = newStart.add(duration, 'minute');

    const queryStart = newStart.subtract(1, 'day').toDate();
    const queryEnd = newStart.add(1, 'day').toDate();

    const existingSchedules = await this.prisma.examSchedule.findMany({
      where: {
        room_code: room_code,
        start_time: {
          gte: queryStart,
          lte: queryEnd,
        },
        ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {})
      },
      select: {
        start_time: true,
        duration: true
      }
    })

    const isOverlap = existingSchedules.some(schedule => {
      const existingStart = dayjs(schedule.start_time);
      const existingEnd = existingStart.add(schedule.duration, 'minute');

      return newStart.isBefore(existingEnd) && newEnd.isAfter(existingStart);
    });
    if (isOverlap) {
      throw new ConflictException("Phòng thi này đã được xếp lịch trùng với thời gian bạn chọn");
    }
  }

  /**
   * Kiểm tra ràng buộc: trong cùng một học kì, mỗi môn chỉ có duy nhất một nhóm.
   * Nếu đã tồn tại ca thi cùng subject_code + group trong semester → throw ConflictException.
   */
  private async checkSubjectGroupUnique(
    semester_id: string,
    subject_code: string,
    group: number,
    excludeScheduleId?: string,
  ) {
    const existing = await this.prisma.examSchedule.findFirst({
      where: {
        semester_id,
        subject_code,
        group,
        ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `Môn ${subject_code} nhóm ${group} đã tồn tại trong học kì này`,
      );
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

    // Validate semester_id
    if (!createExamScheduleDto.semester_id) {
      throw new BadRequestException('Mã học kì không được để trống');
    }

    const semester = await this.prisma.semester.findUnique({
      where: { id: createExamScheduleDto.semester_id },
    });
    if (!semester) {
      throw new NotFoundException('Không tìm thấy học kì');
    }

    // Kiểm tra ràng buộc môn học theo học kì
    if (semester.semester_number === 1 || semester.semester_number === 2) {
      if (existingSubject.semester !== semester.semester_number) {
        throw new BadRequestException(`Môn học này không được tổ chức trong học kì ${semester.semester_number}`);
      }
    }

    // Kiểm tra trùng môn + nhóm trong học kì
    await this.checkSubjectGroupUnique(
      createExamScheduleDto.semester_id,
      createExamScheduleDto.subject_code,
      createExamScheduleDto.group,
    );

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
    student_code?: string,
    lecturer_code?: string,
    semester_id?: string,
  } = {}) {
    const { search, start_time, student_code, lecturer_code, semester_id } = query;
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
      } : {}),

      // Điều kiện lọc theo đợt thi
      ...(semester_id ? { semester_id } : {}),
    };

    const [rawExamSchedules, total] = await Promise.all([
      this.prisma.examSchedule.findMany({
        where,
        select: {
          ...EXAM_SCHEDULE_SELECT,
          _count: {
            select: {
              attendance_records: true,
            }
          },
          exam_supervisors: {
            select: {
              lecturer: {
                select: {
                  last_name: true,
                  first_name: true,
                }
              }
            }
          },
          attendance_records: {
            select: {
              student: {
                select: {
                  class_code: true,
                  class: {
                    select: {
                      name: true,
                    }
                  }
                }
              }
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
      const { _count, exam_supervisors, attendance_records, ...scheduleData } = schedule;

      // Group attendance records by class
      const classMap = new Map<string, { class_code: string; class_name: string; student_count: number }>();
      for (const record of attendance_records) {
        const classCode = record.student.class_code;
        const className = record.student.class.name;
        if (classMap.has(classCode)) {
          classMap.get(classCode)!.student_count++;
        } else {
          classMap.set(classCode, { class_code: classCode, class_name: className, student_count: 1 });
        }
      }

      return {
        ...scheduleData,
        attendance_count: _count?.attendance_records || 0,
        supervisors: exam_supervisors.map(sv => `${sv.lecturer.last_name} ${sv.lecturer.first_name}`),
        class_breakdown: Array.from(classMap.values()).sort((a, b) => a.class_code.localeCompare(b.class_code)),
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
  async findOngoing(query: {
    search?: string;
    page?: number;
    limit?: number;
    semester_id?: string;
    lecturer_code?: string,
  } = {}) {
    const today = new Date();
    const { search, semester_id, lecturer_code } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const now = dayjs().tz('Asia/Ho_Chi_Minh');
    const startOfDay = now.startOf('day').toDate();
    const endOfDay = now.endOf('day').toDate();

    const where: Prisma.ExamScheduleWhereInput = {
      start_time: {
        gte: startOfDay,
        lte: endOfDay,
      },
      ...(search ? {
        OR: [
          { subject_code: { contains: search, mode: 'insensitive' } },
          { subject: { name: { contains: search, mode: 'insensitive' } } },
          { room_code: { contains: search, mode: 'insensitive' } },
          { room: { name: { contains: search, mode: 'insensitive' } } },
        ]
      } : {}),

      ...(semester_id ? { semester_id } : {}),

      ...(lecturer_code ? {
        exam_supervisors: {
          some: {
            lecturer_code: lecturer_code
          }
        }
      } : {}),
    };

    const rawSchedules = await this.prisma.examSchedule.findMany({
      where,
      select: {
        ...EXAM_SCHEDULE_SELECT,
        _count: {
          select: {
            attendance_records: true,
          }
        },
        exam_supervisors: {
          select: {
            lecturer: {
              select: {
                last_name: true,
                first_name: true,
              }
            }
          }
        }
      },
      orderBy: {
        start_time: 'asc',
      }
    });

    // Filter in-memory: chỉ giữ các ca thi đang diễn ra (now trong khoảng [start_time, start_time + duration])
    const nowMs = now.valueOf();
    const ongoingSchedules = rawSchedules.filter(schedule => {
      const startMs = dayjs(schedule.start_time).valueOf();
      const endMs = startMs + (schedule.duration ?? 120) * 60000;
      return nowMs >= startMs && nowMs < endMs;
    });

    const total = ongoingSchedules.length;
    const paginatedSchedules = ongoingSchedules.slice(skip, skip + take);

    const data = paginatedSchedules.map(schedule => {
      const { _count, exam_supervisors, ...scheduleData } = schedule;
      return {
        ...scheduleData,
        attendance_count: _count?.attendance_records || 0,
        supervisors: exam_supervisors.map(sv => `${sv.lecturer.last_name} ${sv.lecturer.first_name}`),
      };
    });

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
      select: { id: true }
    })
    if (!examSchedule) {
      throw new NotFoundException("Không tìm thấy ca thi")
    }
    return examSchedule;
  }

  async update(id: string, updateExamScheduleDto: UpdateExamScheduleDto) {
    // Lấy thông tin ca thi hiện tại từ DB để đối chiếu
    const currentSchedule = await this.prisma.examSchedule.findUnique({
      where: { id },
      include: { subject: true }
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

    // Kiểm tra trùng môn + nhóm trong đợt thi (khi thay đổi subject, group, hoặc semester)
    if (
      updateExamScheduleDto.subject_code !== undefined ||
      updateExamScheduleDto.group !== undefined ||
      updateExamScheduleDto.semester_id !== undefined
    ) {
      const targetSubjectCode = updateExamScheduleDto.subject_code ?? currentSchedule.subject.subject_code;
      const targetGroup = updateExamScheduleDto.group ?? currentSchedule.group;
      const targetSemesterId = updateExamScheduleDto.semester_id ?? currentSchedule.semester_id;

      // Validate semester constraint if subject or semester changes
      if (updateExamScheduleDto.subject_code !== undefined || updateExamScheduleDto.semester_id !== undefined) {
        const semester = await this.prisma.semester.findUnique({ where: { id: targetSemesterId } });
        const subject = await this.prisma.subject.findUnique({ where: { subject_code: targetSubjectCode } });
        if (semester && subject && (semester.semester_number === 1 || semester.semester_number === 2)) {
          if (subject.semester !== semester.semester_number) {
            throw new BadRequestException(`Môn học này không được tổ chức trong học kì ${semester.semester_number}`);
          }
        }
      }

      await this.checkSubjectGroupUnique(
        targetSemesterId,
        targetSubjectCode,
        targetGroup,
        id
      );
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

  async importFromExcel(fileBuffer: Buffer, semester_id: string) {
    const semester = await this.prisma.semester.findUnique({
      where: { id: semester_id },
    });
    if (!semester) throw new BadRequestException('Học kì không hợp lệ');

    const periodStart = dayjs(semester.start_date).tz('Asia/Ho_Chi_Minh').startOf('day').toDate();
    const periodEnd = dayjs(semester.end_date).tz('Asia/Ho_Chi_Minh').endOf('day').toDate();

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

      // Validate date bounds
      if (combinedDateTime < periodStart || combinedDateTime > periodEnd) {
        const pStartStr = dayjs(semester.start_date).tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY');
        const pEndStr = dayjs(semester.end_date).tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY');
        errorRows.push({ row: i, error: `Ngày thi nằm ngoài thời gian thi của học kì (${pStartStr} - ${pEndStr})` });
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
        select: { subject_code: true, semester: true },
      }),
      this.prisma.room.findMany({
        where: { room_code: { in: allRoomCodes } },
        select: { room_code: true },
      }),
    ]);

    const validSubjectMap = new Map(validSubjects.map(s => [s.subject_code, s]));
    const validRoomSet = new Set(validRooms.map(r => r.room_code));

    // ── Pass 3: Validate FK ───────────────────────────────────────
    const validRows = rawRows.filter(row => {
      const subject = validSubjectMap.get(row.subject_code);
      if (!subject) {
        errorRows.push({ row: row.rowNum, error: `Mã môn học '${row.subject_code}' không tồn tại` });
        return false;
      }

      // Check ràng buộc kì học
      if (semester.semester_number === 1 || semester.semester_number === 2) {
        if (subject.semester !== semester.semester_number) {
          errorRows.push({ row: row.rowNum, error: `Môn '${row.subject_code}' không được tổ chức trong học kì ${semester.semester_number}` });
          return false;
        }
      }

      if (!validRoomSet.has(row.room_code)) {
        errorRows.push({ row: row.rowNum, error: `Mã phòng '${row.room_code}' không tồn tại` });
        return false;
      }
      return true;
    });

    // ── Pass 3.5: Validate constraints (Local + DB) ───────────────
    const localSubjectGroups = new Set<string>();
    const localRooms = new Map<string, { start: dayjs.Dayjs, end: dayjs.Dayjs }[]>();

    const fullyValidRows: any[] = [];

    for (const row of validRows) {
      try {
        // Local check: Subject Group
        const sgKey = `${row.subject_code}_${row.group}`;
        if (localSubjectGroups.has(sgKey)) {
          throw new ConflictException(`Môn ${row.subject_code} nhóm ${row.group} bị trùng lặp bên trong file Excel`);
        }
        localSubjectGroups.add(sgKey);

        // DB check: Subject Group
        await this.checkSubjectGroupUnique(semester_id, row.subject_code, row.group);

        // Local check: Room Overlap
        const newStart = dayjs(row.start_time);
        const newEnd = newStart.add(row.duration, 'minute');

        const roomSchedules = localRooms.get(row.room_code) || [];
        const isLocalOverlap = roomSchedules.some(rs => {
          return newStart.isBefore(rs.end) && newEnd.isAfter(rs.start);
        });
        if (isLocalOverlap) {
          throw new ConflictException(`Phòng ${row.room_code} bị trùng lịch thi bên trong file Excel`);
        }
        roomSchedules.push({ start: newStart, end: newEnd });
        localRooms.set(row.room_code, roomSchedules);

        // DB check: Room Overlap
        await this.checkRoomAvailability(row.room_code, row.start_time, row.duration);

        // Valid!
        fullyValidRows.push({ ...row, semester_id });
      } catch (error: any) {
        errorRows.push({ row: row.rowNum, error: error.message });
      }
    }

    // ── Pass 4: createMany 1 query duy nhất ──────────────────────
    if (fullyValidRows.length > 0) {
      await this.prisma.examSchedule.createMany({
        data: fullyValidRows.map(({ rowNum, ...data }) => data),
      });
    }

    errorRows.sort((a, b) => a.row - b.row);
    const errorMessages = errorRows.map(e => `Dòng ${e.row}: ${e.error}`);

    return {
      message: errorRows.length > 0
        ? `Import hoàn tất với một số lỗi. Thành công: ${fullyValidRows.length} dòng. Thất bại: ${errorRows.length} dòng.`
        : `Import thành công toàn bộ ${fullyValidRows.length} dòng!`,
      data: {
        successCount: fullyValidRows.length,
        errorCount: errorRows.length,
        errorMessages,
        rawErrors: errorRows,
      },
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
      message: `Đã xoá thành công ${success} ca thi, thất bại ${failed} ca thi.`,
      data: { success, failed, errors }
    };
  }
}