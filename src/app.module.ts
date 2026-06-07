import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { FalcutiesModule } from './faculties/faculties.module';
import { ClassesModule } from './classes/classes.module';
import { SubjectsModule } from './subjects/subjects.module';
import { RoomsModule } from './rooms/rooms.module';
import { StudentsModule } from './students/students.module';
import { LecturersModule } from './lecturers/lecturers.module';
import { ExamSchedulesModule } from './exam-schedules/exam-schedules.module';
import { AttendanceRecordsModule } from './attendance-records/attendance-records.module';
import { ExamSupervisorsModule } from './exam-supervisors/exam-supervisors.module';
import { AwsModule } from './aws/aws.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    UsersModule,
    FalcutiesModule,
    ClassesModule,
    SubjectsModule,
    RoomsModule,
    StudentsModule,
    LecturersModule,
    ExamSchedulesModule,
    AttendanceRecordsModule,
    ExamSupervisorsModule,
    AwsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
