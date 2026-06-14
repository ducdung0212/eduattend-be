import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';

const CLASS_SELECT: Prisma.ClassSelect = {
  class_code: true,
  name: true,
  faculty_code: true,
  created_at: true,
  updated_at: true,
  faculty: {
    select: {
      faculty_code:true,
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
        totalPages: Math.ceil(total / take),
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
    const existingStudent=await this.prisma.student.findFirst({
      where:{class_code},
      select:{student_code:true}
    })
    if(existingStudent){
      throw new ConflictException('Đang tồn tại sinh viên thuộc lớp này, không thể xóa!')
    }
    await this.prisma.class.delete({
      where: { class_code }
    });
    return {
      message: "Xóa thành công lớp"
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
      return val ? String(val) : '';
    };

    const errorRows: { row: number; error: string }[] = [];
    const rawRows: {
      rowNum: number;
      class_code: string;
      name: string;
      faculty_code: string
    }[] = [];

    const seenCodes = new Set<string>();

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.values || (row.values as any[]).length === 0) continue;

      const class_code = getCellValue(row.getCell(1)).trim();
      const name = getCellValue(row.getCell(2)).trim();
      const faculty_code = getCellValue(row.getCell(3)).trim();

      if (!class_code || !name || !faculty_code) {
        errorRows.push({ row: i, error: 'Thiếu thông tin bắt buộc (mã lớp, tên lớp, mã ngành)' })
        continue;
      }
      if (seenCodes.has(class_code)) {
        errorRows.push({ row: i, error: `Mã lớp '${class_code}' bị trùng lặp trong file` })
        continue;
      }

      rawRows.push({ rowNum: i, class_code, name, faculty_code });
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
    const allClassCodes = [...new Set(rawRows.map(r => r.class_code))];
    const allFacultyCodes = [...new Set(rawRows.map(r => r.faculty_code))];
    const [existingClassCodes, validFacuties] = await Promise.all([
      this.prisma.class.findMany({
        where: { class_code: { in: allClassCodes } },
        select: { class_code: true }
      }),
      this.prisma.faculty.findMany({
        where: { faculty_code: { in: allFacultyCodes } },
        select: { faculty_code: true }
      })
    ])

    const existingCodeSet=new Set(existingClassCodes.map(c=>c.class_code));
    const validFacultySet = new Set(validFacuties.map(f => f.faculty_code));

    const validRows = rawRows.filter(r => {
      if(existingCodeSet.has(r.class_code)){
        errorRows.push({row:r.rowNum,error:`Mã lớp '${r.class_code}' đã tồn tại`})
        return false;
      }
      if (!validFacultySet.has(r.faculty_code)) {
        errorRows.push({ row: r.rowNum, error: `Mã ngành '${r.faculty_code}' không tồn tại` });
        return false;
      }
      return true;
    })

    if(validRows.length>0){
      await this.prisma.class.createMany({
        data:validRows.map(({rowNum,...data})=>data),
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
}
