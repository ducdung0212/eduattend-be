import { IsDateString, IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateSemesterDto {
    @IsNotEmpty({ message: 'Năm học không được để trống' })
    @IsString()
    academic_year!: string; // "2025-2026"

    @IsNotEmpty({ message: 'Học kì không được để trống' })
    @IsIn([1, 2, 3], { message: 'Học kì chỉ nhận giá trị 1, 2 hoặc 3' })
    semester_number!: number;

    @IsNotEmpty({ message: 'Ngày bắt đầu thi không được để trống' })
    @IsDateString()
    start_date!: string;

    @IsNotEmpty({ message: 'Ngày kết thúc thi không được để trống' })
    @IsDateString()
    end_date!: string;
}
