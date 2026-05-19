import { IsNotEmpty, IsString } from "class-validator";

export class CreateFacultyDto {
    @IsNotEmpty({message:'Mã khoa không được để trống'})
    @IsString()
    faculty_code!:string;

    @IsNotEmpty({message:'Tên khoa không được để trống'})
    @IsString()
    name!:string;
}
