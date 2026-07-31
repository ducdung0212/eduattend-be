import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { S3Service } from 'src/aws/s3.service';

// source: 1 - Cập nhật hằng số SELECT
const LECTURER_SELECT: Prisma.LecturerSelect = {
  lecturer_code: true,
  last_name: true,
  first_name: true,
  email: true,
  phone: true,
  faculty_code: true,
  created_at: true,
  updated_at: true,
  user_id: true, 
  user: {        
    select: {
      id: true,
      email: true,
    }
  },
  faculty: {
    select: {
      faculty_code: true,
      name: true
    }
  },
  photos: {
    select: {
      image_url: true,
    }
  }
};

@Injectable()
export class LecturersService {
  private readonly logger = new Logger(LecturersService.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
  ) { }

  // lecturers.service.ts
  async create(createLecturerDto: CreateLecturerDto) {
    const { create_account, ...lecturerData } = createLecturerDto;

    const [existingLecturer, existingFaculty, existingEmail, existingPhone] = await Promise.all([
      this.prisma.lecturer.findUnique({ where: { lecturer_code: lecturerData.lecturer_code } }),
      this.prisma.faculty.findUnique({ where: { faculty_code: lecturerData.faculty_code } }),
      this.prisma.lecturer.findUnique({ where: { email: lecturerData.email } }),
      lecturerData.phone
        ? this.prisma.lecturer.findUnique({ where: { phone: lecturerData.phone } })
        : Promise.resolve(null),
    ]);

    if (existingLecturer) throw new ConflictException('Mã giảng viên đã tồn tại');
    if (!existingFaculty) throw new NotFoundException('Khoa không tồn tại');
    if (existingEmail) throw new ConflictException('Email đã tồn tại');
    if (existingPhone) throw new ConflictException('Số điện thoại đã tồn tại');

    if (create_account) {
      // Lấy phần trước @ làm password mặc định
      const defaultPassword = lecturerData.email.split('@')[0];

      // Kiểm tra User với email này đã tồn tại chưa
      const existingUser = await this.prisma.user.findUnique({
        where: { email: lecturerData.email }
      });

      if (existingUser) {
        // Tài khoản đã tồn tại → tạo lecturer và link luôn vào user đó
        const lecturer = await this.prisma.lecturer.create({
          data: { ...lecturerData, user_id: existingUser.id },
          select: LECTURER_SELECT,
        });
        return {
          message: 'Tạo giảng viên thành công (đã liên kết tài khoản có sẵn)',
          data: lecturer,
        };
      }

      // Chưa có User → tạo cả hai trong transaction
      const lecturer = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: `${lecturerData.last_name} ${lecturerData.first_name}`,
            email: lecturerData.email,
            password: await bcrypt.hash(defaultPassword, 10),
            role: 'lecturer',
          },
        });

        return tx.lecturer.create({
          data: { ...lecturerData, user_id: user.id },
          select: LECTURER_SELECT,
        });
      });

      return { message: 'Tạo giảng viên và tài khoản thành công', data: lecturer };
    }

    // Không tick → tạo lecturer thuần, chưa có tài khoản
    const lecturer = await this.prisma.lecturer.create({
      data: lecturerData,
      select: LECTURER_SELECT,
    });

    return { 
      message: 'Tạo giảng viên thành công',
      data: lecturer 
    };
  }

  async findAll(query: {
    search?: string;
    faculty_code?: string;
    page?: number;
    limit?: number;
    is_has_photo?: boolean;
  } = {}) {
    const { search, faculty_code, is_has_photo } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.LecturerWhereInput = {
      ...(faculty_code ? { faculty_code } : {}),
      ...(is_has_photo === true ? { photos: { some: {} } } : is_has_photo === false ? { photos: { none: {} } } : {}),
      ...(search ? {
        AND: search.split(/\s+/).filter(Boolean).map(term => ({
          OR: [
            { lecturer_code: { contains: term, mode: 'insensitive' } },
            { last_name: { contains: term, mode: 'insensitive' } },
            { first_name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term, mode: 'insensitive' } },
            { faculty_code: { contains: term, mode: 'insensitive' } },
            { faculty: { name: { contains: term, mode: 'insensitive' } } }
          ]
        }))
      } : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.lecturer.findMany({
        where,
        select: LECTURER_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take
      }),
      this.prisma.lecturer.count({ where })
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

  async findOne(lecturer_code: string) {
    const lecturer = await this.prisma.lecturer.findUnique({
      where: { lecturer_code },
      select: LECTURER_SELECT
    });
    if (!lecturer) {
      throw new NotFoundException(`Mã giảng viên ${lecturer_code} không tồn tại`);
    }
    return lecturer;
  }

  async update(lecturer_code: string, updateLecturerDto: UpdateLecturerDto) {
    await this.findOne(lecturer_code);

    // Check khoa
    if (updateLecturerDto.faculty_code) {
      const existingFaculty = await this.prisma.faculty.findUnique({
        where: { faculty_code: updateLecturerDto.faculty_code }
      });
      if (!existingFaculty) {
        throw new NotFoundException(`Mã khoa ${updateLecturerDto.faculty_code} không tồn tại`);
      }
    }

    // THÊM LOGIC CHECK USER_ID NẾU CÓ TRUYỀN LÊN
    if (updateLecturerDto.user_id !== undefined && updateLecturerDto.user_id !== null) {
      const existingUser = await this.prisma.user.findUnique({
        where: { id: updateLecturerDto.user_id }
      });
      if (!existingUser) {
        throw new NotFoundException(`Tài khoản với ID ${updateLecturerDto.user_id} không tồn tại`);
      }
    }

    const updatedLecturer = await this.prisma.lecturer.update({
      where: { lecturer_code },
      data: updateLecturerDto,
      select: LECTURER_SELECT
    });

    return {
      message: "Cập nhật giảng viên thành công",
      data: updatedLecturer
    };
  }

  async remove(lecturer_code: string) {
    await this.findOne(lecturer_code);

    // Lấy ảnh của giảng viên trước khi xóa
    const photo = await this.prisma.lecturerPhoto.findFirst({
      where: { lecturer_code },
      select: { image_url: true },
    });

    // Xóa giảng viên (LecturerPhoto sẽ bị xóa cascade theo DB)
    await this.prisma.lecturer.delete({
      where: { lecturer_code },
    });

    // Xóa ảnh trên S3 bằng full URL (bất đồng bộ, không chặn response)
    if (photo?.image_url) {
      this.s3Service.deleteByUrl(photo.image_url).catch((err) => {
        this.logger.error(
          `Không thể xóa ảnh S3 của giảng viên ${lecturer_code}: ${photo.image_url}`,
          err,
        );
      });
    }

    return {
      message: "Xóa giảng viên thành công",
    };
  }
  async importFromExcel(fileBuffer: Buffer, create_account: boolean = false) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as any);
  const worksheet = workbook.worksheets[0];

  // ── Helper đọc cell an toàn ───────────────────────────────────────────
  const getCellValue = (cell: ExcelJS.Cell): string => {
    const val = cell.value;
    if (val && typeof val === 'object') {
      if ('text' in val) return String((val as any).text);
      if ('richText' in val) return (val as any).richText.map((rt: any) => rt.text).join('');
    }
    return val ? String(val) : '';
  };

  // ── Bước 1: Đọc và validate cơ bản từng row ──────────────────────────
  // Cột Excel: lecturer_code | last_name | first_name | email | phone | faculty_code
  const errorRows: { row: number; error: string }[] = [];
  const rawRows: {
    rowNum: number;
    lecturer_code: string;
    last_name: string;
    first_name: string;
    email: string;
    phone: string | null;
    faculty_code: string;
  }[] = [];

  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    if (!row.values || (row.values as any[]).length === 0) continue;

    const lecturer_code = getCellValue(row.getCell(1)).trim();
    const last_name     = getCellValue(row.getCell(2)).trim();
    const first_name    = getCellValue(row.getCell(3)).trim();
    const email         = getCellValue(row.getCell(4)).trim().toLowerCase();
    const faculty_code  = getCellValue(row.getCell(5)).trim();
    const phone         = getCellValue(row.getCell(6)).trim() || null;

    if (!lecturer_code || !last_name || !first_name || !email || !faculty_code) {
      errorRows.push({ row: i, error: 'Thiếu thông tin bắt buộc (mã GV, họ, tên, email, mã khoa)' });
      continue;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorRows.push({ row: i, error: `Email '${email}' không đúng định dạng` });
      continue;
    }

    if (seenCodes.has(lecturer_code)) {
      errorRows.push({ row: i, error: `Mã giảng viên '${lecturer_code}' bị trùng trong file` });
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

    seenCodes.add(lecturer_code);
    seenEmails.add(email);
    if (phone) seenPhones.add(phone);

    rawRows.push({ rowNum: i, lecturer_code, last_name, first_name, email, phone, faculty_code });
  }

  if (rawRows.length === 0) {
    return {
      message: 'Không có dữ liệu hợp lệ để import',
      data: { successCount: 0, errorCount: errorRows.length, rawErrors: errorRows },
    };
  }

  // ── Bước 2: Batch-check DB — 1 lần duy nhất ──────────────────────────
  const allCodes    = rawRows.map(r => r.lecturer_code);
  const allEmails   = rawRows.map(r => r.email);
  const allPhones   = rawRows.filter(r => r.phone).map(r => r.phone as string);
  const allFaculties = [...new Set(rawRows.map(r => r.faculty_code))];

  const [
    existingLecturerCodes,
    existingLecturerEmails,
    existingLecturerPhones,
    validFaculties,
    existingUsers,
  ] = await Promise.all([
    this.prisma.lecturer.findMany({
      where: { lecturer_code: { in: allCodes } },
      select: { lecturer_code: true },
    }),
    this.prisma.lecturer.findMany({
      where: { email: { in: allEmails } },
      select: { email: true },
    }),
    allPhones.length > 0
      ? this.prisma.lecturer.findMany({
          where: { phone: { in: allPhones } },
          select: { phone: true },
        })
      : Promise.resolve([]),
    this.prisma.faculty.findMany({
      where: { faculty_code: { in: allFaculties } },
      select: { faculty_code: true },
    }),
    this.prisma.user.findMany({
      where: { email: { in: allEmails } },
      select: { id: true, email: true },
    }),
  ]);

  const existingCodeSet  = new Set(existingLecturerCodes.map(l => l.lecturer_code));
  const existingEmailSet = new Set(existingLecturerEmails.map(l => l.email.toLowerCase()));
  const existingPhoneSet = new Set(existingLecturerPhones.map(l => l.phone as string));
  const validFacultySet  = new Set(validFaculties.map(f => f.faculty_code));
  const existingUserMap  = new Map(existingUsers.map(u => [u.email.toLowerCase(), u.id]));

  // ── Bước 3: Validate từng row với dữ liệu DB ─────────────────────────
  const validRows = rawRows.filter(row => {
    if (existingCodeSet.has(row.lecturer_code)) {
      errorRows.push({ row: row.rowNum, error: `Mã giảng viên '${row.lecturer_code}' đã tồn tại` });
      return false;
    }
    if (existingEmailSet.has(row.email)) {
      errorRows.push({ row: row.rowNum, error: `Email '${row.email}' đã tồn tại trong hệ thống` });
      return false;
    }
    if (row.phone && existingPhoneSet.has(row.phone)) {
      errorRows.push({ row: row.rowNum, error: `Số điện thoại '${row.phone}' đã tồn tại` });
      return false;
    }
    if (!validFacultySet.has(row.faculty_code)) {
      errorRows.push({ row: row.rowNum, error: `Mã khoa '${row.faculty_code}' không tồn tại` });
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

  // ── Bước 4: Pre-hash password song song (chỉ khi create_account) ─────
  type ValidRowWithHash = (typeof validRows)[number] & { hashedPassword: string | null };

  const rowsWithHash: ValidRowWithHash[] = await Promise.all(
    validRows.map(async (row) => ({
      ...row,
      hashedPassword: create_account
        ? await bcrypt.hash(row.email.split('@')[0], 10)
        : null,
    }))
  );

  // ── Bước 5: Tách thành 2 nhóm để bulk insert khi có thể ──────────────
  const dbErrorRows: { row: number; error: string }[] = [];
  let successCount = 0;

  if (!create_account) {
    // Không cần account → bulk insert toàn bộ
    try {
      const result = await this.prisma.lecturer.createMany({
        data: rowsWithHash.map(({ rowNum, hashedPassword, ...data }) => data),
        skipDuplicates: true,
      });
      successCount = result.count;

      // Nếu count < validRows.length tức có row bị skip do race condition
      if (result.count < rowsWithHash.length) {
        dbErrorRows.push({
          row: -1,
          error: `${rowsWithHash.length - result.count} dòng bị bỏ qua do trùng dữ liệu tại thời điểm insert`,
        });
      }
    } catch {
      // Nếu bulk insert thất bại hoàn toàn → fallback từng row để xác định dòng lỗi
      const BATCH_SIZE = 100;
      for (let i = 0; i < rowsWithHash.length; i += BATCH_SIZE) {
        const batch = rowsWithHash.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(({ rowNum, hashedPassword, ...data }) =>
            this.prisma.lecturer.create({ data })
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
  } else {
    // Cần tạo account → xử lý song song từng batch (không thể bulk vì cần transaction)
    const BATCH_SIZE = 100;
    for (let i = 0; i < rowsWithHash.length; i += BATCH_SIZE) {
      const batch = rowsWithHash.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (row) => {
          const { rowNum, hashedPassword, ...lecturerData } = row;
          const existingUserId = existingUserMap.get(row.email);

          if (existingUserId) {
            // User đã tồn tại → chỉ tạo lecturer và link vào
            await this.prisma.lecturer.create({
              data: { ...lecturerData, user_id: existingUserId },
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
              await tx.lecturer.create({
                data: { ...lecturerData, user_id: user.id },
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
      message: `Đã xoá thành công ${success} giảng viên, thất bại ${failed} giảng viên.`,
      data: { success, failed, errors }
    };
  }
}
