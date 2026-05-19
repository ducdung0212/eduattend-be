import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  created_at: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    
    // 1. ĐÃ THÊM AWAIT Ở ĐÂY để lấy dữ liệu thật
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
      select: USER_SELECT,
    });

    // 2. Bỏ trường status, giữ lại message tùy chỉnh cho Interceptor bọc ngoài
    return {
      message: "Thêm người dùng thành công",
      data: user
    };
  }

  async findAll(query: {
    search?: string;
    role?: 'admin' | 'lecturer' | 'student';
    page: number;
    limit: number;
  }) {
    const { search, role, page, limit } = query;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where = {
      role: role ?? undefined,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Trả về data và meta thô, Interceptor tự bọc thêm status: 200 và message: "Thành công"
    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
        hasNextPage: page < Math.ceil(total / take),
        hasPrevPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`Không tìm thấy user với id: ${id}`);
    }

    return user; // Trả về data thô để các hàm update/remove tái sử dụng an toàn
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // 3. Check tồn tại trước khi update, nếu không có tự động ném NotFoundException (404)
    await this.findOne(id);

    const data = { ...updateUserDto };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });

    return {
      message: "Cập nhật người dùng thành công",
      data: updatedUser
    };
  }

  async remove(id: string) {
    // 4. Check tồn tại trước khi xóa
    await this.findOne(id);

    await this.prisma.user.delete({
      where: { id },
    });
    
    return { 
      message: 'Xóa người dùng thành công' 
    };
  }
}