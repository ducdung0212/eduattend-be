import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateExamScheduleDto {
    @IsNotEmpty()
    @IsString()
    subject_code!: string;

    @IsNotEmpty()
    @IsDateString()
    start_time!: string; // ISO 8601 string, ví dụ: "2026-05-31T08:30:00Z"

    @IsNotEmpty()
    @IsNumber()
    duration!: number;

    @IsNotEmpty()
    @IsString()
    room_code!: string;

    @IsOptional()
    @IsString()
    note?: string;
}