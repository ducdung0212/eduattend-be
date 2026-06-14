import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';

const USER_SELECT: Prisma.UserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  created_at: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async create(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
      select: USER_SELECT,
    });

    return {
      message: "Thêm người dùng thành công",
      data: user
    };
  }

  async findAll(query: {
    search?: string;
    role?: 'admin' | 'lecturer' | 'student';
    page?: number;
    limit?: number;
  } = {}) {
    const { search, role } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ]
      } : {})
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

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
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
    await this.findOne(id);

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: 'Xóa người dùng thành công'
    };
  }

  // async importFromExcel(fileBuffer: Buffer) {
  //   const workbook = new ExcelJS.Workbook();
  //   await workbook.xlsx.load(fileBuffer as any);
  //   const worksheet = workbook.worksheets[0];
  //   const errorRows:
  //     {
  //       row: number;
  //       error: string
  //     }[] = [];
  //   const validRoles = ['admin', 'lecturer', 'student'];

  //   const getCellValue = (cell: ExcelJS.Cell): string => {
  //     const val = cell.value;
  //     if (val && typeof val === 'object') {
  //       if ('text' in val) return String((val as any).text);
  //       if ('richText' in val) return (val as any).richText.map((rt: any) => rt.text).join('');
  //     }
  //     return val ? String(val) : '';
  //   };

  //   // Thu thập danh sách email từ file Excel để truy vấn tối ưu
  //   const emailsInExcel = new Set<string>();
  //   for (let i = 2; i <= worksheet.rowCount; i++) {
  //     const row = worksheet.getRow(i);
  //     if (!row.values || (row.values as any[]).length === 0) continue;
  //     const email = getCellValue(row.getCell(2)).trim().toLowerCase();
  //     if (email) emailsInExcel.add(email);
  //   }

  //   const existingUsers = await this.prisma.user.findMany({
  //     where: { email: { in: Array.from(emailsInExcel) } },
  //     select: { email: true }
  //   });
  //   const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  //   const validRowsToProcess: any[] = [];

  //   for (let i = 2; i <= worksheet.rowCount; i++) {
  //     const row = worksheet.getRow(i);

  //     if (!row.values || (row.values as any[]).length === 0) continue;

  //     const name = getCellValue(row.getCell(1)).trim();
  //     const email = getCellValue(row.getCell(2)).trim().toLowerCase();
  //     const password = getCellValue(row.getCell(3)).trim();
  //     const role = getCellValue(row.getCell(4)).trim().toLowerCase();

  //     if (!name || !email || !password || !role) {
  //       errorRows.push({ row: i, error: 'Thiếu thông tin bắt buộc (tên, email, mật khẩu, vai trò)!' });
  //       continue;
  //     }
  //     if (password.length < 6) {
  //       errorRows.push({ row: i, error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  //       continue;
  //     }
     
  //     if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  //       errorRows.push({ row: i, error: `Email '${email}' không đúng định dạng` });
  //       continue;
  //     }
  //     if (existingEmails.has(email)) {
  //       errorRows.push({ row: i, error: `Email '${email}' đã tồn tại` });
  //       continue;
  //     }

  //     if (!validRoles.includes(role)) {
  //       errorRows.push({ row: i, error: 'Vai trò không hợp lệ (Chỉ chấp nhận: admin, lecturer, student)' });
  //       continue;
  //     }

  //     validRowsToProcess.push({
  //       name,
  //       email,
  //       password,
  //       role: role as 'admin' | 'lecturer' | 'student',
  //     });

  //     // Thêm email vào existingEmails để bắt lỗi trùng lặp trong cùng 1 file Excel
  //     existingEmails.add(email);
  //   }

  //   // Hash password đồng thời để tối ưu thời gian
  //   const successRows = await Promise.all(
  //     validRowsToProcess.map(async (row) => ({
  //       ...row,
  //       password: await bcrypt.hash(row.password, 10),
  //     }))
  //   );

  //   if (successRows.length > 0) {
  //     await this.prisma.user.createMany({
  //       data: successRows,
  //       skipDuplicates: true,
  //     });
  //   }
  //   return {
  //     message: `Import hoàn tất. Thành công: ${successRows.length} dòng. Thất bại: ${errorRows.length} dòng`,
  //     data: {
  //       successCount: successRows.length,
  //       errorCount: errorRows.length,
  //       errors: errorRows,
  //     }
  //   }

  // }
}