// student-photos/student-photos.controller.ts
import { Controller, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { StudentPhotosService } from './student-photos.service';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('student-photos')
export class StudentPhotosController {
  constructor(private readonly studentPhotosService: StudentPhotosService) {}

  @Post('generate-upload-urls')
  generateUploadUrls(@Body() dto: GenerateUploadUrlDto) {
    return this.studentPhotosService.generateUploadUrls(dto.files);
  }

  @Post('confirm-uploads')
  confirmUploads(@Body() dto: ConfirmUploadDto) {
    return this.studentPhotosService.confirmUploads(dto.uploads);
  }

  @Delete(':student_code')
  deletePhoto(@Param('student_code') student_code: string) {
    return this.studentPhotosService.deletePhoto(student_code);
  }
}