import { IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, Matches } from "class-validator";

export class CreateLecturerDto {
    @IsNotEmpty({ message: "Mã giảng viên không được để trống" })
    @IsString()
    lecturer_code!: string;

    @IsNotEmpty({ message: "Họ và tên đệm không được để trống" })
    @IsString()
    last_name!: string;

    @IsNotEmpty({ message: "Tên không được để trống" })
    @IsString()
    first_name!: string;

    @IsNotEmpty({ message: "Email không được để trống" })
    @IsEmail({}, { message: "Email không đúng định dạng" })
    email!: string;

    @IsOptional()
    @IsPhoneNumber('VN', { message: "Số điện thoại không hợp lệ" })
    phone?: string

    @IsNotEmpty({ message: "Mã khoa không được để trống" })
    @IsString()
    faculty_code!: string;

    @IsOptional()
    create_account?: boolean;

    @IsOptional()
    user_id?: string | null;
}
