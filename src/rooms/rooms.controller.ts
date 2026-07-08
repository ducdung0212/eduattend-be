import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard,RolesGuard)
@Roles('admin')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(@Body() createRoomDto: CreateRoomDto) {
    return this.roomsService.create(createRoomDto);
  }

  @Get()
  findAll(
    @Query('search') search?:string,
    @Query('page') page?:string,
    @Query('limit') limit?:string,
  ) {
    return this.roomsService.findAll({search,page:page?+page:undefined,limit:limit?+limit:undefined});
  }

  @Get('availability')
  findAllWithAvailability(@Query('date') date: string) {
    return this.roomsService.findAllWithAvailability(date);
  }

  @Post('import')
      @UseInterceptors(FileInterceptor('file'))
      async importClasses(
        @UploadedFile() file:Express.Multer.File
      ){
        if(!file){
          throw new BadRequestException('Vui lòng tải lên file Excel');
        }
  
        const allowedMimeTypes=[
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel' // .xls
        ];
  
        if(!allowedMimeTypes.includes(file.mimetype)){
          throw new BadRequestException('Chỉ chấp nhận định dạng file Excel (.xlsx, xls');
        }
  
        return this.roomsService.importFromExcel(file.buffer);
      }

  @Get(':room_code')
  findOne(@Param('room_code') room_code: string) {
    return this.roomsService.findOne(room_code);
  }

  @Patch(':room_code')
  update(@Param('room_code') room_code: string, @Body() updateRoomDto: UpdateRoomDto) {
    return this.roomsService.update(room_code, updateRoomDto);
  }

  @Delete(':room_code')
  remove(@Param('room_code') room_code: string) {
    return this.roomsService.remove(room_code);
  }
}
