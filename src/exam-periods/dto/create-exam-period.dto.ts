import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateExamPeriodDto {
    @IsNotEmpty({ message: 'Tên đợt thi không được để trống' })
    @IsString()
    name!: string;

    @IsNotEmpty({ message: 'Ngày bắt đầu không được để trống' })
    @IsDateString()
    start_date!: string;

    @IsNotEmpty({ message: 'Ngày kết thúc không được để trống' })
    @IsDateString()
    end_date!: string;
}
