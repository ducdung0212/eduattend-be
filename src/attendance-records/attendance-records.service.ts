import { Injectable, ConflictException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAttendanceRecordDto } from './dto/create-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { Prisma, RekognitionResult, AttendanceStatus } from '@prisma/client';
import { LambdaService } from 'src/aws/lambda.service';
import { ConfigService } from '@nestjs/config';
import { CreateAttendanceRecordBulkDto } from './dto/create-attendance-record-bulk.dto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import * as ExcelJS from 'exceljs';

dayjs.extend(utc);
dayjs.extend(timezone);

const ATTENDANCE_RECORD_SELECT: Prisma.AttendanceRecordSelect = {
  id: true,
  exam_schedule_id: true,
  attendance_method: true,
  rekognition_result: true,
  confidence: true,
  attendance_time: true,
  note: true,
  status: true,
  created_at: true,
  updated_at: true,
  student: {
    select: {
      student_code: true,
      first_name: true,
      last_name: true,
      image_url: true,
      class: {
        select: {
          class_code: true,
          name: true,
        }
      }
    }
  }
};

@Injectable()
export class AttendanceRecordsService {
  private readonly logger = new Logger(AttendanceRecordsService.name);
  private confidenceThreshold: number;
  constructor(
    private readonly lamdaService: LambdaService,
    private readonly configService: ConfigService,
    private prisma: PrismaService
  ) {
    this.confidenceThreshold = configService.get<number>('FACE_CONFIDENCE_THRESHOLD', 95);
  }

  async checkIn(imageBuffer: Buffer, exam_schedule_id: string) {
    const examSchedule = await this.prisma.examSchedule.findUnique({
      where: { id: exam_schedule_id },
      select: {
        id: true,
        start_time: true,
        duration: true,
      }
    });
    if (!examSchedule) {
      throw new NotFoundException(`Lịch thi không tồn tại`);
    }

    const now = dayjs();
    const startTime = dayjs(examSchedule.start_time);
    const endTime = startTime.add(examSchedule.duration, 'minute');

    if (now.isBefore(startTime) || now.isAfter(endTime)) {
      throw new BadRequestException(
        `Chỉ có thể điểm danh trong thời gian thi ` +
        `(${startTime.tz('Asia/Ho_Chi_Minh').format('HH:mm')} - ${endTime.tz('Asia/Ho_Chi_Minh').format('HH:mm')})`
      );
    }

    const imageBase64 = imageBuffer.toString('base64');

    const result = await this.lamdaService.verifyFace(imageBase64);

    if (!result.success || !result.data) {
      throw new BadRequestException(
        result.message ?? 'Không nhận diện được khuôn mặt',
      );
    }
    const { user, confidence, face_id, rekognition_result } = result.data;

    const student_code = user.student_code;

    if (!student_code) {
      throw new BadRequestException("Chỉ sinh viên mới có thể điểm danh ca thi.");
    }

    return this.processCheckIn(
      student_code,
      exam_schedule_id,
      now,
      'face',
      rekognition_result as RekognitionResult,
      confidence,
      face_id
    );
  }

  async checkInQR(student_code: string, exam_schedule_id: string) {
    const examSchedule = await this.prisma.examSchedule.findUnique({
      where: { id: exam_schedule_id },
      select: {
        id: true,
        start_time: true,
        duration: true,
      }
    });
    if (!examSchedule) {
      throw new NotFoundException(`Lịch thi không tồn tại`);
    }

    const now = dayjs();
    const startTime = dayjs(examSchedule.start_time);
    const endTime = startTime.add(examSchedule.duration, 'minute');

    if (now.isBefore(startTime) || now.isAfter(endTime)) {
      throw new BadRequestException(
        `Chỉ có thể điểm danh trong thời gian thi ` +
        `(${startTime.tz('Asia/Ho_Chi_Minh').format('HH:mm')} - ${endTime.tz('Asia/Ho_Chi_Minh').format('HH:mm')})`
      );
    }

    return this.processCheckIn(
      student_code,
      exam_schedule_id,
      now,
      'qr',
      undefined,
      100, // Confidence for QR is effectively 100% since it's an exact match
      undefined
    );
  }

  private async processCheckIn(
    student_code: string,
    exam_schedule_id: string,
    now: dayjs.Dayjs,
    method: 'face' | 'qr',
    rekognition_result?: RekognitionResult,
    confidence?: number,
    face_id?: string
  ) {
    const existingStudent = await this.prisma.student.findUnique({
      where: { student_code: student_code },
      select: {
        student_code: true,
        last_name: true,
        first_name: true
      }
    });

    if (!existingStudent) {
      throw new BadRequestException(`Sinh viên ${student_code} không có trong hệ thống.`);
    }

    const fullName = `${existingStudent.last_name} ${existingStudent.first_name}`;

    const validStudent = await this.prisma.attendanceRecord.findFirst({
      where: { exam_schedule_id, student_code }
    });

    if (!validStudent) {
      // Tìm lịch thi của sinh viên trong ngày hôm nay
      const startOfDay = now.tz("Asia/Ho_Chi_Minh").startOf('day').toDate();
      const endOfDay = now.tz("Asia/Ho_Chi_Minh").endOf('day').toDate();

      const todaySchedules = await this.prisma.attendanceRecord.findMany({
        where: {
          student_code: student_code,
          exam_schedule: {
            start_time: {
              gte: startOfDay,
              lte: endOfDay,
            }
          }
        },
        include: {
          exam_schedule: {
            include: {
              subject: true,
              room: true
            }
          }
        },
        orderBy: {
          exam_schedule: {
            start_time: 'asc'
          }
        }
      });

      if (todaySchedules.length > 0) {
        const scheduleDetails = todaySchedules.map(r => {
          const s = r.exam_schedule;
          const timeStr = dayjs(s.start_time).tz("Asia/Ho_Chi_Minh").format('HH:mm');
          return `môn ${s.subject.name} lúc ${timeStr} tại phòng ${s.room?.name || ''}`;
        }).join(', ');
        throw new NotFoundException(`Sinh viên ${fullName} (${student_code}) đi nhầm phòng. Lịch thi hôm nay: ${scheduleDetails}.`);
      }

      throw new NotFoundException(`Sinh viên ${fullName} (${student_code}) không thuộc ca thi này và không có lịch thi nào trong hôm nay.`);
    }

    if (method === 'face' && confidence !== undefined) {
      if (confidence < this.confidenceThreshold) {
        this.logger.warn(
          `Độ trùng khớp thấp: ${confidence} < ${this.confidenceThreshold} | student: ${student_code}`,
        );
        throw new BadRequestException(
          `Hệ thống nhận ra sinh viên ${fullName} - ${student_code} nhưng độ trùng khớp chỉ đạt ${confidence.toFixed(1)}% (yêu cầu ${this.confidenceThreshold}%). Giảng viên vui lòng xem xét.`,
        );
      }
    }

    if (method === 'face') {
      this.logger.log(`Check-in khuôn mặt thành công: ${student_code} | confidence: ${confidence} | faceId: ${face_id}`);
    } else {
      this.logger.log(`Check-in QR thành công: ${student_code}`);
    }

    // Kiểm tra xem đã điểm danh chưa
    if (validStudent.attendance_time) {
      return {
        message: `Sinh viên ${fullName} - ${student_code} đã điểm danh rồi.`,
        data: {
          existingStudent,
          confidence,
          checkedAt: validStudent.attendance_time,
          alreadyCheckedIn: true
        }
      };
    }

    // Sửa attendance vào DB qua Prisma
    await this.prisma.attendanceRecord.update({
      where: {
        student_code_exam_schedule_id: {
          student_code,
          exam_schedule_id
        }
      },
      data: {
        attendance_time: now.toDate(),
        attendance_method: method === 'qr' ? 'qr_code' : 'face',
        ...(rekognition_result ? { rekognition_result } : {}),
        ...(confidence ? { confidence } : {}),
        status: 'present',
      }
    })

    return {
      message: `Điểm danh thành công cho sinh viên ${fullName} - ${student_code}`,
      data: {
        existingStudent,
        confidence,
        checkedAt: new Date(),
        alreadyCheckedIn: false
      }
    };
  }

  async create(createAttendanceRecordDto: CreateAttendanceRecordDto) {
    const schedule = await this.prisma.examSchedule.findUnique({
      where: { id: createAttendanceRecordDto.exam_schedule_id },
      include: { room: true }
    });
    if (!schedule) {
      throw new NotFoundException("Không tìm thấy ca thi");
    }

    if (!createAttendanceRecordDto.force_capacity_override && schedule.room) {
      const currentCount = await this.prisma.attendanceRecord.count({
        where: { exam_schedule_id: createAttendanceRecordDto.exam_schedule_id }
      });
      if (currentCount >= schedule.room.capacity) {
        throw new ConflictException({
          require_confirmation: true,
          message: `Phòng thi đã đầy (sức chứa: ${schedule.room.capacity}, hiện tại: ${currentCount}). Bạn có chắc chắn muốn thêm sinh viên này?`
        });
      }
    }

    const existingSubjectSemester = await this.prisma.attendanceRecord.findFirst({
      where: {
        student_code: createAttendanceRecordDto.student_code,
        exam_schedule: {
          subject_code: schedule.subject_code,
          semester_id: schedule.semester_id,
        }
      }
    });
    
    if (existingSubjectSemester) {
      throw new ConflictException("Sinh viên đã có lịch thi môn này trong học kì hiện tại");
    }

    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: {
        student_code_exam_schedule_id: {
          student_code: createAttendanceRecordDto.student_code,
          exam_schedule_id: createAttendanceRecordDto.exam_schedule_id
        }
      }
    });
    if (existingRecord) {
      throw new ConflictException("Bản ghi điểm danh đã tồn tại cho sinh viên và lịch thi này");
    }

    const record = await this.prisma.attendanceRecord.create({
      data: createAttendanceRecordDto,
      select: ATTENDANCE_RECORD_SELECT
    });
    return {
      message: "Thêm bản ghi điểm danh thành công",
      data: record
    };
  }

  async findAll(query: {
    search?: string;
    student_code?: string;
    exam_schedule_id?: string;
    page?: number;
    limit?: number;
    rekognition_result?: RekognitionResult;
    status?: AttendanceStatus;
  } = {}) {
    const { search, exam_schedule_id, student_code, rekognition_result, status } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.AttendanceRecordWhereInput = {
      ...(student_code ? { student_code } : {}),
      ...(exam_schedule_id ? { exam_schedule_id } : {}),
      ...(status ? { status } : {}),
      ...(search ? {
        AND: search.split(/\s+/).filter(Boolean).map(term => ({
          student: {
            OR: [
              { student_code: { contains: term, mode: 'insensitive' } },
              { first_name: { contains: term, mode: 'insensitive' } },
              { last_name: { contains: term, mode: 'insensitive' } },
              { class_code: { contains: term, mode: 'insensitive' } },
            ]
          }
        }))
      } : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        select: ATTENDANCE_RECORD_SELECT,
        orderBy: { created_at: 'desc' },
        take,
        skip
      }),
      this.prisma.attendanceRecord.count({ where })
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
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { id },
      select: ATTENDANCE_RECORD_SELECT
    });
    if (!record) {
      throw new NotFoundException(`Bản ghi điểm danh ${id} không tồn tại`);
    }
    return record;
  }

  async update(id: string, updateAttendanceRecordDto: UpdateAttendanceRecordDto) {
    await this.findOne(id);

    const record = await this.prisma.attendanceRecord.update({
      where: { id },
      data: updateAttendanceRecordDto,
      select: ATTENDANCE_RECORD_SELECT
    });
    return {
      message: "Cập nhật bản ghi điểm danh thành công",
      data: record
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.attendanceRecord.delete({
      where: { id }
    });
    return {
      message: "Đã xóa thành công"
    };
  }

  async bulkCreate(dto: CreateAttendanceRecordBulkDto) {
    const { exam_schedule_id, student_codes } = dto;

    // 1. Loại trùng trong input
    const uniqueCodes = Array.from(new Set(student_codes.map((c) => c.trim().toUpperCase())));

    // 2. Kiểm tra ca thi tồn tại và lấy thời gian thi
    const schedule = await this.prisma.examSchedule.findUnique({
      where: { id: exam_schedule_id },
      include: { room: true }
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy ca thi');

    if (!dto.force_capacity_override && schedule.room) {
      const currentCount = await this.prisma.attendanceRecord.count({
        where: { exam_schedule_id }
      });
      if (currentCount + uniqueCodes.length > schedule.room.capacity) {
        throw new ConflictException({
          require_confirmation: true,
          message: `Phòng thi sẽ bị quá tải! (Sức chứa: ${schedule.room.capacity}, Hiện tại: ${currentCount}, Thêm mới: ${uniqueCodes.length}). Bạn có chắc chắn muốn thêm vượt mức?`
        });
      }
    }

    // 3. Kiểm tra sinh viên tồn tại (1 query)
    const students = await this.prisma.student.findMany({
      where: { student_code: { in: uniqueCodes } },
      select: { student_code: true },
    });
    const validStudentCodes = new Set(students.map((s) => s.student_code));

    // 3.5. Kiểm tra xem sinh viên đã có lịch thi môn này trong cùng học kì chưa
    const existingSubjectSemesterRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        student_code: { in: Array.from(validStudentCodes) },
        exam_schedule: {
          subject_code: schedule.subject_code,
          semester_id: schedule.semester_id,
        }
      },
      select: { student_code: true }
    });
    const alreadyTakenStudentCodes = new Set(existingSubjectSemesterRecords.map(r => r.student_code));

    // 4. Tính toán mốc 00:00:00 và 23:59:59 của ngày thi theo giờ Việt Nam
    const startOfDayVN = dayjs(schedule.start_time).tz("Asia/Ho_Chi_Minh").startOf('day').toDate();
    const endOfDayVN = dayjs(schedule.start_time).tz("Asia/Ho_Chi_Minh").endOf('day').toDate();

    // 5. Kiểm tra xem sinh viên nào ĐÃ CÓ ca thi TRÙNG GIỜ trong ngày hôm đó
    const currentStartTime = dayjs(schedule.start_time);
    const currentEndTime = currentStartTime.add(schedule.duration, 'minute');

    const sameDayRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        student_code: { in: Array.from(validStudentCodes) },
        exam_schedule: {
          start_time: {
            gte: startOfDayVN,
            lte: endOfDayVN,
          }
        }
      },
      include: {
        exam_schedule: true
      }
    });

    const busyStudentCodes = new Set<string>();
    for (const record of sameDayRecords) {
      const recordStart = dayjs(record.exam_schedule.start_time);
      const recordEnd = recordStart.add(record.exam_schedule.duration, 'minute');

      // Kiểm tra xem có giao nhau về thời gian không: A_start < B_end && A_end > B_start
      if (currentStartTime.isBefore(recordEnd) && currentEndTime.isAfter(recordStart)) {
        busyStudentCodes.add(record.student_code);
      }
    }

    // 6. Phân loại kết quả
    const success: { student_code: string; id: string }[] = [];
    const failed: { student_code: string; reason: string }[] = [];
    const toCreate: string[] = [];

    for (const code of uniqueCodes) {
      if (!validStudentCodes.has(code)) {
        failed.push({ student_code: code, reason: 'Không tìm thấy sinh viên' });
        continue;
      }
      if (alreadyTakenStudentCodes.has(code)) {
        failed.push({ student_code: code, reason: 'Đã có lịch thi môn này trong học kì hiện tại' });
        continue;
      }
      if (busyStudentCodes.has(code)) {
        failed.push({ student_code: code, reason: 'Đã có lịch thi trong ngày hôm nay trùng giờ' });
        continue;
      }
      toCreate.push(code);
    }

    // 7. Sử dụng createMany (1 câu INSERT duy nhất) thay vì $transaction N create riêng lẻ
    if (toCreate.length > 0) {
      try {
        const result = await this.prisma.attendanceRecord.createMany({
          data: toCreate.map((student_code) => ({ student_code, exam_schedule_id })),
          skipDuplicates: true,
        });

        // Query lại để lấy ID các bản ghi vừa tạo
        const createdRecords = await this.prisma.attendanceRecord.findMany({
          where: {
            exam_schedule_id,
            student_code: { in: toCreate },
          },
          select: { id: true, student_code: true },
        });
        createdRecords.forEach((c) => success.push({ student_code: c.student_code, id: c.id }));

        // Nếu có bản ghi bị skip (do trùng tại thời điểm insert)
        if (result.count < toCreate.length) {
          const insertedCodes = new Set(createdRecords.map((c) => c.student_code));
          toCreate.forEach((code) => {
            if (!insertedCodes.has(code)) {
              failed.push({ student_code: code, reason: 'Sinh viên đã có trong danh sách ca thi' });
            }
          });
        }
      } catch (err) {
        // Fallback: nếu createMany fail thì insert từng cái để biết chính xác lỗi
        const results = await Promise.allSettled(
          toCreate.map((student_code) =>
            this.prisma.attendanceRecord.create({
              data: { student_code, exam_schedule_id },
              select: { id: true, student_code: true },
            }),
          ),
        );
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            success.push({ student_code: result.value.student_code, id: result.value.id });
          } else {
            failed.push({ student_code: toCreate[idx], reason: 'Lỗi khi tạo bản ghi' });
          }
        });
      }
    }

    return {
      message: `Đã thêm ${success.length}/${uniqueCodes.length} sinh viên`,
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
      message: `Đã xoá thành công ${success} bản ghi điểm danh, thất bại ${failed} bản ghi.`,
      data: { success, failed, errors }
    };
  }

  async importFromExcel(fileBuffer: Buffer, exam_schedule_id: string, force_capacity_override: boolean = false) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException("File Excel không hợp lệ hoặc rỗng");
    }

    let mssvColIndex = -1;
    let headerRowIndex = -1;

    // Quét qua 15 dòng đầu tiên để tìm header
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (headerRowIndex !== -1 || rowNumber > 15) return;
      
      row.eachCell((cell, colNumber) => {
        const val = cell.text?.toString().trim().toLowerCase() || '';
        if (val.includes('mssv') || val.includes('mã sv') || val.includes('mã sinh viên') || val.includes('student code') || val === 'student_code') {
          mssvColIndex = colNumber;
          headerRowIndex = rowNumber;
        }
      });
    });

    if (headerRowIndex === -1 || mssvColIndex === -1) {
      throw new BadRequestException("Không tìm thấy cột MSSV trong file Excel. Hãy đảm bảo cột có tiêu đề chứa chữ 'MSSV', 'Mã SV', 'Mã sinh viên' hoặc 'Student Code'.");
    }

    const student_codes: string[] = [];
    const codeToRowMap = new Map<string, number>();

    // Lấy data từ dưới dòng header
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return;

      const cell = row.getCell(mssvColIndex);
      const val = cell.text?.toString().trim();
      if (val) {
        student_codes.push(val);
        const upperVal = val.toUpperCase();
        if (!codeToRowMap.has(upperVal)) {
          codeToRowMap.set(upperVal, rowNumber);
        }
      }
    });

    if (student_codes.length === 0) {
      throw new BadRequestException("Không tìm thấy danh sách mã sinh viên nào hợp lệ trong file");
    }

    // Tái sử dụng logic bulkCreate
    const bulkResult = await this.bulkCreate({
      exam_schedule_id,
      student_codes,
      force_capacity_override
    });

    const failed = bulkResult.data.failed;
    
    if (failed.length > 0) {
      const rawErrors = failed.map(f => ({
        row: codeToRowMap.get(f.student_code.toUpperCase()) || 0,
        error: f.reason
      }));

      // Trả về response bình thường (HTTP 200) thay vì ném lỗi để frontend nhận được rawErrors
      return {
        message: `Import hoàn tất. Thêm thành công ${bulkResult.data.success.length} sinh viên, thất bại ${failed.length} sinh viên.`,
        data: {
          success: bulkResult.data.success,
          rawErrors
        }
      };
    }

    return {
      message: `Import thành công toàn bộ ${bulkResult.data.success.length} sinh viên!`,
      data: {
        success: bulkResult.data.success
      }
    };
  }
}