import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const ROOM_SELECT = {
  room_code: true,
  name: true,
  capacity:true
} as const;
@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) { }
  async create(createRoomDto: CreateRoomDto) {
    const existingRoom = await this.prisma.room.findUnique({
      where: { room_code: createRoomDto.room_code }
    })
    if (existingRoom) {
      throw new ConflictException("Mã phòng đã tồn tại");
    }
    const room = await this.prisma.room.create({
      data: createRoomDto,
      select: ROOM_SELECT
    })
    return {
      message: "Thêm phòng mới thành công",
      data: room
    }
  }

  async findAll(query: {
    search?: string,
    page?: number,
    limit?: number
  } = {}) {
    const { search } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 100;

    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where = {
      OR: search
        ? [
          { room_code: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } }
        ] : undefined
    }
    const [data, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        select: ROOM_SELECT,
        orderBy: { created_at: 'desc' },
        take,
        skip
      }),
      this.prisma.room.count({ where })
    ])
    return {
      data: data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
        hasNextPage: page < Math.ceil(total / take),
        hasPrevPage: page > 1
      }
    }
  }

  async findOne(room_code: string) {
    const room = await this.prisma.room.findUnique({
      where: { room_code },
      select: ROOM_SELECT
    })
    if (!room) {
      throw new NotFoundException(`Mã phòng ${room_code} không tồn tại`)
    }
    return room;
  }

  async update(room_code: string, updateRoomDto: UpdateRoomDto) {
    await this.findOne(room_code);

    const room = await this.prisma.room.update({
      where: { room_code },
      data: updateRoomDto,
      select: ROOM_SELECT
    })
    return {
      message: "Cập nhật phòng thành công",
      data: room
    }
  }

  async remove(room_code: string) {
    await this.findOne(room_code);

    const existingSchedule = await this.prisma.examSchedule.findFirst({
      where: { room_code },
      select: { id: true }
    });
    if (existingSchedule) {
      throw new ConflictException('Đang có lịch thi sử dụng phòng này, không thể xóa!');
    }

    await this.prisma.room.delete({
      where:{room_code}
    })
    return{
      message:"Đã xóa thành công"
    }
  }

  /**
   * Trả về tất cả phòng kèm danh sách ca thi đã chiếm trong ngày `date`.
   * Frontend dùng để hiển thị trạng thái trống/bận cho room card grid.
   */
  async findAllWithAvailability(date: string) {
    const dayStart = dayjs.tz(date, 'Asia/Ho_Chi_Minh').startOf('day').toDate();
    const dayEnd = dayjs.tz(date, 'Asia/Ho_Chi_Minh').endOf('day').toDate();

    const [allRooms, schedulesInDay] = await Promise.all([
      this.prisma.room.findMany({
        select: ROOM_SELECT,
        orderBy: { room_code: 'asc' },
      }),
      this.prisma.examSchedule.findMany({
        where: {
          start_time: { gte: dayStart, lte: dayEnd },
        },
        select: {
          room_code: true,
          start_time: true,
          duration: true,
          subject: { select: { name: true } },
        },
      }),
    ]);

    // Nhóm ca thi theo room_code
    const slotsByRoom = new Map<string, { start_time: string; end_time: string; subject_name: string }[]>();
    for (const s of schedulesInDay) {
      const start = dayjs(s.start_time);
      const end = start.add(s.duration, 'minute');
      const slot = {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        subject_name: s.subject.name,
      };
      if (!slotsByRoom.has(s.room_code)) {
        slotsByRoom.set(s.room_code, []);
      }
      slotsByRoom.get(s.room_code)!.push(slot);
    }

    return {
      data: allRooms.map((room) => ({
        ...room,
        occupied_slots: slotsByRoom.get(room.room_code) ?? [],
      })),
    };
  }
  async importFromExcel(fileBuffer:Buffer){
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const worksheet=workbook.worksheets[0];

    const getCellValue=(cell: ExcelJS.Cell): string=>{
      const val=cell.value;
      if(val && typeof val ==='object'){
        if('text' in val) return String((val as any).text);
        if('richText' in val) return (val as any).richText.map((rt:any)=>rt.text).join('');
      }
      return val ? String(val) :''
    };
    const errorRows: {row: number; error:string}[]=[];
    const rawRows:{
      rowNum:number;
      room_code:string;
      name:string;
      capacity:number;
    }[]=[];

    const seenCodes=new Set<string>();

    for(let i=2;i<=worksheet.rowCount;i++){
      const row=worksheet.getRow(i);
      if(!row.values||(row.values as any[]).length===0) continue;

      const room_code=getCellValue(row.getCell(1)).trim();
      const name=getCellValue(row.getCell(2)).trim();
      const capacity=getCellValue(row.getCell(3)).trim();

      if(!room_code||!name||!capacity){
        errorRows.push({ row: i, error: 'Thiếu thông tin bắt buộc (mã phòng, tên phòng, sức chứa)' })
        continue;
      }
      if (seenCodes.has(room_code)) {
        errorRows.push({ row: i, error: `Mã phòng '${room_code}' bị trùng lặp trong file` })
        continue;
      }
      const parsedCapacity = Number(capacity);
      if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
        errorRows.push({ row: i, error: `Sức chứa '${capacity}' không hợp lệ` });
        continue;
      }
      rawRows.push({rowNum:i,room_code,name,capacity:parsedCapacity});
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
    const allRoomCodes = [...new Set(rawRows.map(r => r.room_code))];
    const existingRoomCodes = await this.prisma.room.findMany({
      where: { room_code: { in: allRoomCodes } },
      select: { room_code: true }
    })


    const existingCodeSet = new Set(existingRoomCodes.map(s => s.room_code));
    const validRows = rawRows.filter(r => {
      if (existingCodeSet.has(r.room_code)) {
        errorRows.push({ row: r.rowNum, error: `Mã phòng '${r.room_code}' đã tồn tại` })
        return false;
      }
      return true;
    })

    if (validRows.length > 0) {
      await this.prisma.room.createMany({
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
      message: `Đã xoá thành công ${success} phòng, thất bại ${failed} phòng.`,
      data: { success, failed, errors }
    };
  }
}
