import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải từ 6 ký tự trở lên' })
  password!: string;
}

export class LoginFaceDto {
  @IsNotEmpty({ message: 'Ảnh khuôn mặt không được để trống' })
  imageBase64!: string;
}

export class RefreshDto {
  @IsNotEmpty({ message: 'Refresh token không được để trống' })
  refresh_token!: string;
}