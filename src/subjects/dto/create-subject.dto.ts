import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateSubjectDto {
    @IsNotEmpty({ message: "Mã môn không được để trống" })
    @IsString()
    subject_code!: string;

    @IsNotEmpty({ message: "Tên môn không được để trống" })
    @IsString()
    name!: string;

    @IsOptional()
    @IsIn([1, 2], { message: 'Học kì chỉ nhận giá trị 1 hoặc 2' })
    semester?: number;
}
