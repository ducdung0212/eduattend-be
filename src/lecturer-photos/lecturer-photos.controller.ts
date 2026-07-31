import { Controller, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { LecturerPhotosService } from './lecturer-photos.service';
import { GenerateLecturerUploadUrlDto } from './dto/generate-upload-url.dto';
import { ConfirmLecturerUploadDto } from './dto/confirm-upload.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'lecturer')
@Controller('lecturer-photos')
export class LecturerPhotosController {
  constructor(private readonly lecturerPhotosService: LecturerPhotosService) {}

  @Post('generate-upload-urls')
  generateUploadUrls(@Body() dto: GenerateLecturerUploadUrlDto) {
    return this.lecturerPhotosService.generateUploadUrls(dto.files);
  }

  @Post('confirm-uploads')
  confirmUploads(@Body() dto: ConfirmLecturerUploadDto) {
    return this.lecturerPhotosService.confirmUploads(dto.uploads);
  }

  @Delete(':lecturer_code')
  deletePhoto(@Param('lecturer_code') lecturer_code: string) {
    return this.lecturerPhotosService.deletePhoto(lecturer_code);
  }

  @Post('bulk-delete')
  deletePhotosMultiple(@Body('ids') ids: string[]) {
    return this.lecturerPhotosService.deletePhotosMultiple(ids);
  }
}

