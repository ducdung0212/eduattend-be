import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

const CLASS_SELECT: Prisma.ClassSelect = {
  class_code: true,
  name: true,
  faculty_code: true,
  created_at: true,
  updated_at: true,
  faculty: {
    select: {
      name: true
    }
  }
};

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) { }

  async create(createClassDto: CreateClassDto) {
    const existingClass = await this.prisma.class.findUnique({
      where: { class_code: createClassDto.class_code }
    });
    if (existingClass) {
      throw new ConflictException("Mã lớp này đã tồn tại");
    }
    const existingFaculty = await this.prisma.faculty.findUnique({
      where: { faculty_code: createClassDto.faculty_code },
    });
    if (!existingFaculty) {
      throw new BadRequestException("Mã khoa không tồn tại");
    }
    const c = await this.prisma.class.create({
      data: createClassDto,
      select: CLASS_SELECT
    });
    return {
      message: "Thêm lớp thành công",
      data: c
    };
  }

  async findAll(query: {
    search?: string;
    faculty_code?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { search, faculty_code } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.ClassWhereInput = {
      ...(faculty_code ? { faculty_code } : {}),
      ...(search ? {
        OR: [
          { class_code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { faculty_code: { contains: search, mode: 'insensitive' } },
          { faculty: { name: { contains: search, mode: 'insensitive' } } }
        ]
      } : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        select: CLASS_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.class.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPage: Math.ceil(total / take),
        hasNextPage: page < Math.ceil(total / take),
        hasPrevPage: page > 1,
      }
    };
  }

  async findOne(class_code: string) {
    const c = await this.prisma.class.findUnique({
      where: { class_code },
      select: CLASS_SELECT
    });
    if (!c) {
      throw new NotFoundException(`Không tìm thấy lớp có mã: ${class_code}`);
    }
    return c;
  }

  async update(class_code: string, updateClassDto: UpdateClassDto) {
    await this.findOne(class_code);

    if (updateClassDto.faculty_code) {
      const existingFaculty = await this.prisma.faculty.findUnique({
        where: { faculty_code: updateClassDto.faculty_code },
      });
      if (!existingFaculty) {
        throw new BadRequestException("Mã khoa không tồn tại");
      }
    }
    const updatedClass = await this.prisma.class.update({
      data: updateClassDto,
      where: { class_code },
      select: CLASS_SELECT
    });

    return {
      message: "Cập nhật lớp thành công",
      data: updatedClass
    };
  }

  async remove(class_code: string) {
    await this.findOne(class_code);

    await this.prisma.class.delete({
      where: { class_code }
    });
    return {
      message: "Xóa thành công lớp"
    };
  }
}
