import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../common/decorators/roles.decorator'; 
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/role.guard'; 

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('users') // Đã bao gồm '/users' cho tất cả
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post() // API sẽ là: POST /users
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get() // API sẽ là: GET /users?search=...&role=...
  findAll(
    @Query('search') search?: string,
    @Query('role') role?: 'admin' | 'lecturer' | 'student',
  ) {
    return this.usersService.findAll({ search, role });
  }

  @Get(':id') // API sẽ là: GET /users/UUID
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id') // API sẽ là: PATCH /users/UUID
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id') // API sẽ là: DELETE /users/UUID
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}