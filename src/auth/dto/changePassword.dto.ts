import { IsNotEmpty, MinLength } from "class-validator";

export class ChangePassword{
    @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
    curPass!: string;

    @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
    @MinLength(6, { message: 'Mật khẩu mới phải từ 6 ký tự trở lên' })
    newPass!: string;
}
