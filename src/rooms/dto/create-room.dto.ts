import { IsNotEmpty, IsNumber, IsString, Max, Min } from "class-validator";

export class CreateRoomDto {
    @IsNotEmpty({ message: "Mã phòng không được để trống" })
    @IsString()
    room_code!: string;

    @IsNotEmpty({ message: "Tên phòng không được để trống" })
    @IsString()
    name!: string;

    @IsNotEmpty({ message: "Sức chứa của phòng không được để trống" })
    @IsNumber()
    @Min(1, { message: 'Sức chứa phải lớn hơn 0' })
    @Max(100, { message: 'Sức chứa không được vượt quá 100' })
    capacity!: number;
}
