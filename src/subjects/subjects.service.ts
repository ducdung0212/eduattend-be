import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';

const SUBJECT_SELECT: Prisma.SubjectSelect = {
  subject_code: true,
  name: true,
  semester: true,
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
    semester?: number;
  } = {}) {
    const { search, semester } = query;
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
      } : {}),
      ...(semester !== undefined ? { OR: [{ semester }, { semester: null }] } : {}),
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
        totalPages: Math.ceil(total / limit),
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

    const existingSchedule = await this.prisma.examSchedule.findFirst({
      where: { subject_code },
      select: { id: true }
    });
    if (existingSchedule) {
      throw new ConflictException('Đang có lịch thi của môn học này, không thể xóa!');
    }

    await this.prisma.subject.delete({
      where: { subject_code }
    });

    return {
      message: "Xóa môn thành công"
    };
  }
  async importFromExcel(fileBuffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const worksheet = workbook.worksheets[0];

    const getCellValue = (cell: ExcelJS.Cell): string => {
      const val = cell.value;
      if (val && typeof val === 'object') {
        if ('text' in val) return String((val as any).text);
        if ('richText' in val) return (val as any).richText.map((rt: any) => rt.text).join('');
      }
      return val ? String(val) : ''
    };
    const errorRows: { row: number; error: string }[] = [];
    const rawRows: {
      rowNum: number;
      subject_code: string;
      name: string;
      semester: number | null;
    }[] = [];

    const seenCodes = new Set<string>();

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.values || (row.values as any[]).length === 0) continue;

      const subject_code = getCellValue(row.getCell(1)).trim();
      const name = getCellValue(row.getCell(2)).trim();
      const semesterRaw = getCellValue(row.getCell(3)).trim();

      if (!subject_code || !name) {
        errorRows.push({ row: i, error: 'Thiếu thông tin bắt buộc (mã môn, tên môn)' })
        continue;
      }

      let semester: number | null = null;
      if (semesterRaw) {
        const parsed = Number(semesterRaw);
        if (parsed === 1 || parsed === 2) {
          semester = parsed;
        } else {
          errorRows.push({ row: i, error: `Học kì '${semesterRaw}' không hợp lệ (chỉ nhận 1 hoặc 2)` });
          continue;
        }
      }

      if (seenCodes.has(subject_code)) {
        errorRows.push({ row: i, error: `Mã môn '${subject_code}' bị trùng lặp trong file` })
        continue;
      }
      rawRows.push({ rowNum: i, subject_code, name, semester });
    }
    if (rawRows.length === 0) {
      return {
        message: 'Không có dữ liệu hợp lệ để import',
        data: {
          successCount: 0,
          errorCount: errorRows.length,
          errorMessage: errorRows.map(e => `Dòng ${e.row}: ${e.error}`)
        }
      }
    }
    const allSubjectCodes = [...new Set(rawRows.map(r => r.subject_code))];
    const existingSubjectCodes = await this.prisma.subject.findMany({
      where: { subject_code: { in: allSubjectCodes } },
      select: { subject_code: true }
    })


    const existingCodeSet = new Set(existingSubjectCodes.map(s => s.subject_code));

    const validRows = rawRows.filter(r => {
      if (existingCodeSet.has(r.subject_code)) {
        errorRows.push({ row: r.rowNum, error: `Mã môn '${r.subject_code}' đã tồn tại` })
        return false;
      }
      return true;
    })

    if (validRows.length > 0) {
      await this.prisma.subject.createMany({
        data: validRows.map(({ rowNum, ...data }) => data),
      });
    }

    errorRows.sort((a, b) => a.row - b.row);
    const errorMessages = errorRows.map(e => `Dòng ${e.row}: ${e.error}`);

    return {
      message: errorRows.length > 0
        ? `Import hoàn tất với một số lỗi. Thành công: ${validRows.length} dòng. Thất bại: ${errorRows.length} dòng.`
        : `Import thành công toàn bộ ${validRows.length} dòng!`,
      data: {
        successCount: validRows.length,
        errorCount: errorRows.length,
        errorMessages,
        rawErrors: errorRows,
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
      message: `Đã xoá thành công ${success} môn học, thất bại ${failed} môn học.`,
      data: { success, failed, errors }
    };
  }
}
