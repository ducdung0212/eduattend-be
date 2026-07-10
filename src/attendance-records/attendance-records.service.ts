import { Injectable, ConflictException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAttendanceRecordDto } from './dto/create-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { Prisma, RekognitionResult } from '@prisma/client';
import { LambdaService } from 'src/aws/lambda.service';
import { ConfigService } from '@nestjs/config';
import { CreateAttendanceRecordBulkDto } from './dto/create-attendance-record-bulk.dto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const ATTENDANCE_RECORD_SELECT: Prisma.AttendanceRecordSelect = {
  id: true,
  exam_schedule_id: true,
  attendance_method: true,
  rekognition_result: true,
  confidence: true,
  attendance_time: true,
  created_at: true,
  updated_at: true,
  student: {
    select: {
      student_code: true,
      first_name: true,
      last_name: true,
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
    const { student, confidence, face_id,rekognition_result } = result.data;

    const student_code = student.student_code;

    const validStudent = await this.prisma.attendanceRecord.findFirst({
      where: { exam_schedule_id, student_code }
    })

    if (!validStudent) {
      throw new NotFoundException(`Sinh viên ${student_code} không tồn tại trong ca thi`);
    }

    // Dùng đúng field từ DynamoDB: student.student_code
    if (confidence < this.confidenceThreshold) {
      this.logger.warn(
        `Độ trùng khớp thấp: ${confidence} < ${this.confidenceThreshold} | student: ${student.student_code}`,
      );
      throw new BadRequestException(
        `Độ trùng khớp ${confidence.toFixed(1)}% chưa đủ, vui lòng thử lại`,
      );
    }
    const existingStudent = await this.prisma.student.findUnique({
      where: { student_code: student.student_code },
      select: {
        student_code: true,
        last_name: true,
        first_name: true
      }
    })
    if (!existingStudent) {
      throw new BadRequestException(`Sinh viên ${student.student_code} không có trong hệ thống.`);
    }
    const fullName = `${existingStudent.last_name} ${existingStudent.first_name}`;
    this.logger.log(
      `Check-in thành công: ${student.student_code} | confidence: ${confidence} | faceId: ${face_id}`,
    );

    // Kiểm tra xem đã điểm danh chưa
    if (validStudent.attendance_time) {
      return {
        message: `Sinh viên ${fullName} - ${student.student_code} đã điểm danh rồi.`,
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
      where:{
        student_code_exam_schedule_id: {
          student_code,
          exam_schedule_id
        }
      },
      data:{
        attendance_time: now.toDate(),
        attendance_method: 'face',
        rekognition_result: rekognition_result as RekognitionResult,
        confidence: confidence,
      }
    })
    
    return {
      message: `Điểm danh thành công cho sinh viên ${fullName} - ${student?.student_code}`,
      data: {
        existingStudent,
        confidence,
        checkedAt: new Date(),
        alreadyCheckedIn: false
      }
    };
  }

  async create(createAttendanceRecordDto: CreateAttendanceRecordDto) {
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
    student_code?: string; // Đã sửa thành optional (?)
    exam_schedule_id?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { search, exam_schedule_id, student_code } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.AttendanceRecordWhereInput = {
      ...(student_code ? { student_code } : {}),
      ...(exam_schedule_id ? { exam_schedule_id } : {}),
      ...(search ? {
        student: {
          OR: [
            { student_code: { contains: search, mode: 'insensitive' } },
            { first_name: { contains: search, mode: 'insensitive' } },
            { last_name: { contains: search, mode: 'insensitive' } },
            { class_code: { contains: search, mode: 'insensitive' } }, // Fix nhẹ nếu schema bạn search class_code qua relation
          ]
        }
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
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy ca thi');

    // 3. Kiểm tra sinh viên tồn tại (1 query)
    const students = await this.prisma.student.findMany({
      where: { student_code: { in: uniqueCodes } },
      select: { student_code: true },
    });
    const validStudentCodes = new Set(students.map((s) => s.student_code));

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
      if (busyStudentCodes.has(code)) {
        failed.push({ student_code: code, reason: 'Đã có lịch thi trong ngày hôm nay' });
        continue;
      }
      toCreate.push(code);
    }

    // 7. Thực hiện Transaction để Insert và lấy về ID
    if (toCreate.length > 0) {
      await this.prisma.$transaction(
        toCreate.map((student_code) =>
          this.prisma.attendanceRecord.create({
            data: { student_code, exam_schedule_id },
            select: { id: true, student_code: true },
          }),
        ),
      ).then((created) => {
        created.forEach((c) => success.push({ student_code: c.student_code, id: c.id }));
      }).catch((err) => {
        toCreate.forEach((code) => {
          if (!success.find((s) => s.student_code === code)) {
            failed.push({ student_code: code, reason: 'Lỗi khi tạo bản ghi' });
          }
        });
      });
    }

    return {
      message: `Đã thêm ${success.length}/${uniqueCodes.length} sinh viên`,
      data: {
        success,
        failed,
      }
    };
  }
}