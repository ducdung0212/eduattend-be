import { Injectable, ConflictException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAttendanceRecordDto } from './dto/create-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { Prisma } from '@prisma/client';
import { LambdaService } from 'src/aws/lambda.service';
import { ConfigService } from '@nestjs/config';

const ATTENDANCE_RECORD_SELECT: Prisma.AttendanceRecordSelect = {
  id: true,
  student_code: true,
  exam_schedule_id: true,
  attendance_method: true,
  rekognition_result: true,
  confidence: true,
  attendance_time: true,
  created_at: true,
  updated_at: true,
  student: {
    select: {
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
  async checkIn(/*exam_schedule_id: string,*/ imageBuffer: Buffer) {
    const imageBase64 = imageBuffer.toString('base64');

    const result = await this.lamdaService.verifyFace(imageBase64,/*exam_schedule_id*/);

    if (!result.success || !result.data) {
      throw new BadRequestException(
        result.message ?? 'Không nhận diện được khuôn mặt',
      );
    }
    const { student, confidence, face_id } = result.data;

    // Dùng đúng field từ DynamoDB: student.student_code
    if (confidence < this.confidenceThreshold) {
      this.logger.warn(
        `Độ trùng khớp thấp: ${confidence} < ${this.confidenceThreshold} | student: ${student.student_code}`,
      );
      throw new BadRequestException(
        `Độ trùng khớp ${confidence.toFixed(1)}% chưa đủ, vui lòng thử lại`,
      );
    }
    const studentCheckedIn = await this.prisma.student.findUnique({
      where: { student_code: student.student_code },
      select: {
        student_code: true,
        last_name: true,
        first_name: true
      }
    })
    if (!studentCheckedIn) {
      throw new BadRequestException(`Nhận diện thành công nhưng không tìm thấy sinh viên ${student.student_code} trong hệ thống dữ liệu.`);
    }
    const fullName=`${studentCheckedIn?.last_name} ${studentCheckedIn?.first_name}`;
    this.logger.log(
      `Check-in thành công: ${student.student_code} | confidence: ${confidence} | faceId: ${face_id}`,
    );


    // Sửa attendance vào DB qua Prisma
    //TODO
    // });

    // Placeholder trả về khi chưa có Prisma
    return {
      message: `Điểm danh thành công cho sinh viên ${fullName}-${studentCheckedIn?.student_code}`,
      data:{
        studentCheckedIn,
        confidence,
        checkedAt:new Date()
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
    page?: number;
    limit?: number;
  } = {}) {
    const { search } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.AttendanceRecordWhereInput = {
      ...(search ? {
        student: {
          OR: [
            { first_name: { contains: search, mode: 'insensitive' } },
            { last_name: { contains: search, mode: 'insensitive' } },
            { class_code: { contains: search, mode: 'insensitive' } },
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
        totalPage: Math.ceil(total / take),
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
}
