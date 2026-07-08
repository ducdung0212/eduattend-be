import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { emit, emitWarning } from 'process';

const STUDENT_SELECT: Prisma.StudentSelect = {
  student_code: true,
  class_code: true,
  last_name: true,
  first_name: true,
  email: true,
  phone: true,
  user_id: true,
  created_at: true,
  updated_at: true,
  user: {
    select: {
      id: true,
      email: true,
    }
  },
  class: {
    select: {
      class_code:true,
      name: true,
      faculty: {
        select: {
          faculty_code: true,
          name: true,
        }
      }
    }
  },
  photos: {
    select: {
      image_url: true
    }
  }
};

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) { }

  async create(createStudentDto: CreateStudentDto) {
    const { create_account, ...studentData } = createStudentDto;
    const [existingStudent, existingClass, existingEmail, existingPhone] = await Promise.all([
      this.prisma.student.findUnique({
        where: { student_code: studentData.student_code }
      }),
      this.prisma.class.findUnique({
        where: { class_code: studentData.class_code }
      }),
      this.prisma.student.findUnique({
        where: { email: studentData.email }
      }),
      studentData.phone
        ? this.prisma.student.findUnique({
          where: { phone: studentData.phone }
        })
        : Promise.resolve(null),
    ])


    if (existingEmail) {
      throw new ConflictException("Email đã tồn tại");
    }

    if (existingPhone) {
      throw new ConflictException("Số điện thoại đã tồn tại");
    }

    if (existingStudent) {
      throw new ConflictException("Mã sinh viên đã tồn tại");
    }
    if (!existingClass) {
      throw new NotFoundException(`Mã lớp ${studentData.class_code} không tồn tại`);
    }
    if (create_account) {
      const defaultPassword = studentData.student_code;
      const existingUser = await this.prisma.user.findUnique({
        where: { email: studentData.email }
      });
      if (existingUser) {
        const student = await this.prisma.student.create({
          data: { ...studentData, user_id: existingUser.id },
          select: STUDENT_SELECT,
        });
        return {
          message: 'Tạo sinh viên thành công (đã liên kết tài khoản có sẵn)',
          data: student,
        }
      }

      const student = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: `${studentData.last_name} ${studentData.first_name}`,
            email: studentData.email,
            password: await bcrypt.hash(defaultPassword, 10),
            role: 'student'
          }
        })
        return tx.student.create({
          data: { ...studentData, user_id: user.id },
          select: STUDENT_SELECT,
        });
      });

      return { messgae: 'Tạo sinh viên và tài khoản thành công', data: student };
    }

    await this.prisma.student.create({
      data: studentData,
      select: STUDENT_SELECT,
    })
    return {
      message: "Tạo sinh viên mới thành công",
      data: studentData,
    };
  }

  async findAll(query: {
    search?: string;
    class_code?: string;
    faculty_code?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { search, class_code, faculty_code } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.StudentWhereInput = {
      ...(class_code ? { class_code } : {}),
      ...(faculty_code ? { class: { faculty_code } } : {}),
      ...(search ? {
        OR: [
          { student_code: { contains: search, mode: 'insensitive' } },
          { last_name: { contains: search, mode: 'insensitive' } },
          { first_name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { class_code: { contains: search, mode: 'insensitive' } },
          { class: { name: { contains: search, mode: 'insensitive' } } }
        ]
      } : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: STUDENT_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.student.count({ where })
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
      }
    };
  }

  async findOne(student_code: string) {
    const student = await this.prisma.student.findUnique({
      where: { student_code },
      select: STUDENT_SELECT
    });
    if (!student) {
      throw new NotFoundException(`Không tìm thấy sinh viên có mã ${student_code}`);
    }
    return student;
  }

  async update(student_code: string, updateStudentDto: UpdateStudentDto) {
    await this.findOne(student_code);

    if (updateStudentDto.class_code) {
      const existingClass = await this.prisma.class.findUnique({
        where: { class_code: updateStudentDto.class_code }
      });
      if (!existingClass) {
        throw new NotFoundException(`Mã lớp ${updateStudentDto.class_code} không tồn tại`);
      }
    }

    const updatedStudent = await this.prisma.student.update({
      where: { student_code },
      data: updateStudentDto,
      select: STUDENT_SELECT
    });

    return {
      message: "Cập nhật sinh viên thành công",
      data: updatedStudent
    };
  }

  async remove(student_code: string) {
    await this.findOne(student_code);

    await this.prisma.student.delete({
      where: { student_code }
    });
    return {
      message: "Xóa sinh viên thành công"
    };
  }

  async getDetail(student_code: string) {
    const student = await this.prisma.student.findUnique({
      where: { student_code },
      select: STUDENT_SELECT
    });
    if (!student) {
      throw new NotFoundException(`Không tìm thấy sinh viên có mã ${student_code}`);
    }
    return student;
  }
  async importFromExcel(fileBuffer: Buffer, create_account: boolean = false) {
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

    const errorRows: { row: number; error: string }[] = [];
    const rawRows: {
      rowNum: number;
      student_code: string;
      last_name: string;
      first_name: string;
      email: string;
      phone: string | null;
      class_code: string
    }[] = [];

    const seenCodes = new Set<string>();
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.values || (row.values as any[]).length === 0) continue;

      const student_code = getCellValue(row.getCell(1)).trim();
      const last_name = getCellValue(row.getCell(2)).trim();
      const first_name = getCellValue(row.getCell(3)).trim();
      const email = getCellValue(row.getCell(4)).trim().toLowerCase();
      const phone = getCellValue(row.getCell(5)).trim() || null;
      const class_code = getCellValue(row.getCell(6)).trim();

      if (!student_code || !last_name || !first_name || !email || !class_code) {
        errorRows.push({ row: i, error: 'Thiếu thông tin bắt buộc (mã GV, họ, tên, email, mã khoa)' });
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorRows.push({ row: i, error: `Email '${email}' không đúng định dạng` });
        continue;
      }

      if (seenCodes.has(student_code)) {
        errorRows.push({ row: i, error: `Mã giảng viên '${student_code}' bị trùng trong file` });
        continue;
      }
      if (seenEmails.has(email)) {
        errorRows.push({ row: i, error: `Email '${email}' bị trùng trong file` });
        continue;
      }
      if (phone && seenPhones.has(phone)) {
        errorRows.push({ row: i, error: `Số điện thoại '${phone}' bị trùng trong file` });
        continue;
      }

      seenCodes.add(student_code);
      seenEmails.add(email);
      if (phone) seenPhones.add(phone);

      rawRows.push({ rowNum: i, student_code, last_name, first_name, email, phone, class_code });
    }

    if (rawRows.length === 0) {
      return {
        message: 'Không có dữ liệu hợp lệ để import',
        data: { successCount: 0, errorCount: errorRows.length, errors: errorRows },
      };
    }

    const allCodes = rawRows.map(r => r.student_code);
    const allEmails = rawRows.map(r => r.email);
    const allPhones = rawRows.filter(r => r.phone).map(r => r.phone as string);
    const allClasses = [...new Set(rawRows.map(r => r.class_code))];

    const [
      existingStudentCodes,
      existingStudentEmails,
      existingStudentPhones,
      validClasses,
      existingUsers,
    ] = await Promise.all([
      this.prisma.student.findMany({
        where: { student_code: { in: allCodes } },
        select: { student_code: true },
      }),
      this.prisma.student.findMany({
        where: { email: { in: allEmails } },
        select: { email: true },
      }),
      allPhones.length > 0
        ? this.prisma.student.findMany({
          where: { phone: { in: allPhones } },
          select: { phone: true },
        })
        : Promise.resolve([]),
      this.prisma.class.findMany({
        where: { class_code: { in: allClasses } },
        select: { class_code: true },
      }),
      this.prisma.user.findMany({
        where: { email: { in: allEmails } },
        select: { id: true, email: true },
      })
    ]);

    const existingCodeSet = new Set(existingStudentCodes.map(s => s.student_code));
    const existingEmailSet = new Set(existingStudentEmails.map(l => l.email.toLowerCase()));
    const existingPhoneSet = new Set(existingStudentPhones.map(l => l.phone as string));
    const validFacultySet = new Set(validClasses.map(c => c.class_code));
    const existingUserMap = new Map(existingUsers.map(u => [u.email.toLowerCase(), u.id]));

    const validRows = rawRows.filter(row => {
      if (existingCodeSet.has(row.student_code)) {
        errorRows.push({ row: row.rowNum, error: `Mã sinh viên '${row.student_code}' đã tồn tại` });
        return false;
      }
      if (existingEmailSet.has(row.email)) {
        errorRows.push({ row: row.rowNum, error: `Email ${row.email} đã tồn tại trong hệ thống` });
        return false;
      }
      if (row.phone && existingPhoneSet.has(row.phone)) {
        errorRows.push({ row: row.rowNum, error: `Số điện thoại '${row.phone}' đã tồn tại` });
        return false;
      }
      if (!validFacultySet.has(row.class_code)) {
        errorRows.push({ row: row.rowNum, error: `Mã lớp '${row.class_code}' không tồn tại` });
        return false;
      }
      return true;
    });

    if (validRows.length === 0) {
      errorRows.sort((a, b) => a.row - b.row);
      return {
        message: `Import hoàn tất với một số lỗi. Thành công: 0 dòng. Thất bại: ${errorRows.length} dòng.`,
        data: {
          successCount: 0,
          errorCount: errorRows.length,
          errorMessages: errorRows.map(e => `Dòng ${e.row}: ${e.error}`),
          rawErrors: errorRows,
        },
      };
    }

    type ValidRowWithHash = (typeof validRows)[number] & { hashedPassword: string | null };

    const rowsWithHash: ValidRowWithHash[] = await Promise.all(
      validRows.map(async (row) => ({
        ...row,
        hashedPassword: create_account
          ? await bcrypt.hash(row.email.split('@')[0], 10)
          : null,
      }))
    )

    const dbErrorRows: { row: number; error: string }[] = [];
    let successCount = 0;

    if (!create_account) {
      try {
        const result = await this.prisma.student.createMany({
          data: rowsWithHash.map(({ rowNum, hashedPassword, ...data }) => data),
          skipDuplicates: true,
        });
        successCount = result.count;

        if (result.count < rowsWithHash.length) {
          dbErrorRows.push({
            row: -1,
            error: `${rowsWithHash.length - result.count} dòng bị bỏ qua do trùng dữ liệu tại thời điểm import`,
          });
        }
      } catch {
        const BATCH_SIZE = 100;
        for (let i = 0; i < rowsWithHash.length; i += BATCH_SIZE) {
          const batch = rowsWithHash.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(({ rowNum, hashedPassword, ...data }) =>
              this.prisma.student.create({ data })
            )
          );
          results.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
              successCount++;
            } else {
              dbErrorRows.push({ row: batch[idx].rowNum, error: 'Lỗi khi lưu vào database' });
            }
          });
        }
      }
    } else{
    const BATCH_SIZE = 100;
    for (let i = 0; i < rowsWithHash.length; i += BATCH_SIZE) {
      const batch = rowsWithHash.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (row) => {
          const { rowNum, hashedPassword, ...studentData } = row;
          const existingUserId = existingUserMap.get(row.email);

          if (existingUserId) {
            await this.prisma.student.create({
              data: { ...studentData, user_id: existingUserId },
            });
          } else {
            // Chưa có user → tạo cả hai trong transaction
            await this.prisma.$transaction(async (tx) => {
              const user = await tx.user.create({
                data: {
                  name: `${row.last_name} ${row.first_name}`,
                  email: row.email,
                  password: hashedPassword!,
                  role: 'lecturer',
                },
              });
              await tx.student.create({
                data: { ...studentData, user_id: user.id },
              });
            });
          }
        })
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          dbErrorRows.push({ row: batch[idx].rowNum, error: 'Lỗi khi lưu vào database' });
        }
      });
    }
  }

  // ── Xử lý và format lỗi trước khi trả về ─────────────────────────────
  const allErrors = [...errorRows, ...dbErrorRows].sort((a, b) => a.row - b.row);
  const formattedErrors = allErrors.map(err =>
    err.row === -1 ? err.error : `Dòng ${err.row}: ${err.error}`
  );

  return {
    message:
      allErrors.length > 0
        ? `Import hoàn tất với một số lỗi. Thành công: ${successCount} dòng. Thất bại: ${allErrors.length} dòng.`
        : `Import thành công toàn bộ ${successCount} dòng!`,
    data: {
      successCount,
      errorCount: allErrors.length,
      errorMessages: formattedErrors,
      rawErrors: allErrors,
    },
  };
}
}