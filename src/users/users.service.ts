import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { use } from 'passport';
import { contains } from 'class-validator';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService){}

  async create(createUserDto: CreateUserDto) {
    const hashedPassword= await bcrypt.hash(createUserDto.password,10);
    const user=await this.prisma.user.create({
      data:{
        ...createUserDto,
        password:hashedPassword,
      },
      select:{
        id:true,
        name:true,
        email:true,
        role:true,
        created_at:true,
      }
    });
    return user;
  }

  async findAll(query: {search?: string; role?: 'admin'|'lecturer'|'student'}) {
    const {search,role}=query;

    return this.prisma.user.findMany({
      where:{
        role: role ?role:undefined,
        OR: search?[
          {name:{contains:search}},
          {email:{contains:search}},
        ]:undefined,
      },
      select:{
        id:true,
        name:true,
        email:true,
        role:true,
        created_at:true,
      },
      orderBy:{created_at:'desc'},
    }) ;
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where:{id}
    })
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    let data={...updateUserDto};
    if(data.password){
      data.password= await bcrypt.hash(data.password,10);
    }

    return this.prisma.user.update({
      where:{id},
      data,
      select:{id:true,name:true,email:true,role:true}
    })
  }

  async remove(id: string) {
    await this.prisma.user.delete({
      where:{id}
    });
    return {message:'Xóa thành công'};
  }
}
