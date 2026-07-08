import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateExamScheduleDto {
    @IsNotEmpty({message:"Mã môn học không được để trống"})
    @IsString()
    subject_code!: string;

    @IsNotEmpty({message:"Thời gian thi không được để trống"})
    @IsDateString()
    start_time!: string; // ISO 8601 string, ví dụ: "2026-05-31T08:30:00Z"

    @IsNotEmpty({message:"Thời lượng thi không được để trống"})
    @IsNumber()
    duration!: number;

    @IsNotEmpty({message:"Mã phòng không được để trống"})
    @IsString()
    room_code!: string;

    @IsOptional()
    @IsString()
    note?: string;

    @IsNotEmpty({message:"Nhóm không được để trống"})
    @IsNumber()
    group!: number;

    @IsNotEmpty({message:"Mã kỳ thi không được để trống"})
    @IsUUID('4', { message: 'Mã kỳ thi không hợp lệ' })
    exam_period_id!: string;
}