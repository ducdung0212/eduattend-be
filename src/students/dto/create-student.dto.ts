import { IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, Length, Matches } from "class-validator";

export class CreateStudentDto {
    @IsNotEmpty({ message: "Mã sinh viên không được để trống" })
    @IsString()
    @Matches(/^(DH|LT)\d{8}$/i, { message: 'Mã sinh viên không đúng định dạng (DH/LT) + 8 số' })
    student_code!: string

    @IsNotEmpty({ message: "Vui lòng chọn lớp cho sinh viên" })
    @IsString()
    class_code!: string

    @IsNotEmpty({ message: "Họ và tên đệm không được để trống" })
    @IsString()
    last_name!: string

    @IsNotEmpty({ message: "Tên không được để trống" })
    @IsString()
    first_name!: string

    @IsOptional()
    @IsEmail({}, { message: "Email không đúng định dạng" })
    email?: string;
    
    @IsOptional()
    @IsPhoneNumber('VN', { message: "Số điện thoại không hợp lệ" })
    phone?: string

    @IsOptional()
    create_account?: boolean;

    @IsOptional()
    user_id?: string | null;


}
