import { IsNotEmpty, IsString } from "class-validator";

export class CreateSubjectDto {
    @IsNotEmpty({ message: "Mã môn không được để trống" })
    @IsString()
    subject_code!: string;

    @IsNotEmpty({ message: "Tên môn không được để trống" })
    @IsString()
    name!: string;
}
