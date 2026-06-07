import { IsNotEmpty, IsString } from "class-validator";

export class CreateRoomDto {
    @IsNotEmpty({message:"Mã phòng không được để trống"})
    @IsString()
    room_code!:string;

    @IsNotEmpty({message:"Tên phòng không được để trống"})
    @IsString()
    name!:string;
}
