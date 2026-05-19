import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { Roles } from "src/common/decorators/roles.decorator";

export class CreateUserDto {
    @IsNotEmpty({message:'Tên không được để trống'})
    @IsString()
    name!:string;

    @IsNotEmpty({message:'Email không được để trống'})
    @IsEmail({},{message:'Email không đúng định dạng'})
    email!:string;

    @IsNotEmpty({message:'Mật khẩu không được để trống'})
    @MinLength(6,{message:'Mật khẩu phải từ 6 ký tự'})
    password!:string;

    @IsNotEmpty({message:'Role không được để trống'})
    @IsEnum(['admin','lecturer','student'],{message:'Role không hợp lệ'})
    role!:'admin'|'lecturer'|'student';
}
