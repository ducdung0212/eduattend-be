import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PrismaService } from 'src/prisma/prisma.service';

const ROOM_SELECT = {
  room_code: true,
  name: true
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
        totalPage: Math.ceil(total / take),
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
    await this.prisma.room.delete({
      where:{room_code}
    })
    return{
      message:"Đã xóa thành công"
    }
  }
}
