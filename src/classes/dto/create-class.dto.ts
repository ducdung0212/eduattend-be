import { IsNotEmpty, IsString } from "class-validator";

export class CreateClassDto {
    @IsNotEmpty({message:"Mã lớp không được trống"})
    @IsString()
    class_code!:string;

    @IsNotEmpty({message:"Tên lớp không được trống"})
    @IsString()
    name!:string;

    @IsNotEmpty({message:"Khoa không được để trống"})
    @IsString()
    faculty_code!:string;
}
