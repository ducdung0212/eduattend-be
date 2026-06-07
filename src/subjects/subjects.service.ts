import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

const SUBJECT_SELECT: Prisma.SubjectSelect = {
  subject_code: true,
  name: true,
  created_at: true,
  updated_at: true,
};

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) { }

  async create(createSubjectDto: CreateSubjectDto) {
    const existingSubject = await this.prisma.subject.findUnique({
      where: { subject_code: createSubjectDto.subject_code }
    });
    if (existingSubject) {
      throw new ConflictException("Mã môn học này đã tồn tại");
    }

    const subject = await this.prisma.subject.create({
      data: createSubjectDto,
      select: SUBJECT_SELECT
    });

    return {
      message: "Thêm môn học thành công",
      data: subject
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

    const where: Prisma.SubjectWhereInput = {
      ...(search ? {
        OR: [
          { subject_code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ]
      } : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.subject.findMany({
        where,
        select: SUBJECT_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.subject.count({ where }),
    ]);

    return {
      data,
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

  async findOne(subject_code: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { subject_code },
      select: SUBJECT_SELECT
    });
    if (!subject) {
      throw new NotFoundException(`Không tìm thấy mã môn ${subject_code}`);
    }
    return subject;
  }

  async update(subject_code: string, updateSubjectDto: UpdateSubjectDto) {
    await this.findOne(subject_code);

    const updatedSubject = await this.prisma.subject.update({
      where: { subject_code },
      data: updateSubjectDto,
      select: SUBJECT_SELECT
    });

    return {
      message: "Cập nhật môn thành công",
      data: updatedSubject
    };
  }

  async remove(subject_code: string) {
    await this.findOne(subject_code);

    await this.prisma.subject.delete({
      where: { subject_code }
    });

    return {
      message: "Xóa môn thành công"
    };
  }
}
