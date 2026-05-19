import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { PrismaService } from 'src/prisma/prisma.service';

const FACULTY_SELECT = {
  faculty_code: true,
  name: true
} as const;

@Injectable()
export class FacultiesService {
  constructor(private prisma: PrismaService) { }

  async create(createFacultyDto: CreateFacultyDto) {
    const existing = await this.prisma.faculty.findUnique({
      where: { faculty_code: createFacultyDto.faculty_code }
    });
    if (existing) {
      throw new ConflictException('Mã khoa này đã tồn tại!');
    }
    
    // Đã thêm await chuẩn chỉ
    const faculty = await this.prisma.faculty.create({
      data: createFacultyDto,
      select: FACULTY_SELECT,
    });

    return {
      message: "Thêm khoa mới thành công",
      data: faculty
    };
  }

  async findAll(query: {
    search?: string;
    page: number;
    limit: number;
  }) {
    const { search, page, limit } = query;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    
    const where = {
      OR: search
      ? [
          { faculty_code: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } }
        ]
      : undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.faculty.findMany({
        where,
        select: FACULTY_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.faculty.count({ where }),
    ]);

    return {
      data,
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

  async findOne(faculty_code: string) {
    const faculty = await this.prisma.faculty.findUnique({
      where: { faculty_code },
      select: FACULTY_SELECT
    });

    if (!faculty) {
      throw new NotFoundException(`Không tìm thấy khoa với mã khoa: ${faculty_code}`);
    }
    return faculty; // Trả về data thô để hàm update/remove dễ tái sử dụng
  }

  async update(faculty_code: string, updateFacultyDto: UpdateFacultyDto) {
    // Check xem khoa có tồn tại không trước khi update
    await this.findOne(faculty_code); 

    // Đã thêm await chuẩn chỉ
    const updatedFaculty = await this.prisma.faculty.update({
      where: { faculty_code },
      data: updateFacultyDto,
      select: FACULTY_SELECT
    });

    return {
      message: "Cập nhật khoa thành công",
      data: updatedFaculty
    };
  }

  async remove(faculty_code: string) {
    await this.findOne(faculty_code);

    await this.prisma.faculty.delete({
      where: { faculty_code }
    });
    
    return { 
      message: 'Xóa khoa thành công' 
    };
  }
}