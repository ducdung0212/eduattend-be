import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, IsDateString } from 'class-validator';
import { AttendanceMethod, RekognitionResult, AttendanceStatus } from '@prisma/client';
export class CreateAttendanceRecordDto {
    @IsNotEmpty({message:"Mã sinh viên không được để trống"})
    @IsString()
    student_code!: string;

    @IsNotEmpty({message:"Mã sinh viên không được để trống"})
    @IsString()
    exam_schedule_id!: string;

    @IsOptional()
    @IsEnum(AttendanceMethod)
    attendance_method?: AttendanceMethod;
    
    @IsOptional() 
    @IsEnum(RekognitionResult)
    rekognition_result?: RekognitionResult;

    @IsOptional()
    @IsNumber() 
    confidence?: number;

    @IsOptional()
    attendance_time?: string | null;

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    @IsEnum(AttendanceStatus)
    status?: AttendanceStatus;
}
