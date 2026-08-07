import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const totalStudents = await this.prisma.student.count();
    
    // Students who have at least one photo
    const studentsWithPhotos = await this.prisma.student.count({
      where: {
        image_url: {
          not: null
        }
      }
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const examsToday = await this.prisma.examSchedule.count({
      where: {
        start_time: {
          gte: todayStart,
          lte: todayEnd,
        }
      }
    });

    const totalLecturers= await this.prisma.lecturer.count();

    // Attendance stats
    const attendanceStats = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      _count: {
        _all: true
      }
    });

    const methodStats = await this.prisma.attendanceRecord.groupBy({
      by: ['attendance_method'],
      _count: {
        _all: true
      }
    });

    return {
      overview: {
        totalStudents,
        studentsWithPhotos,
        photoCoveragePercent: totalStudents > 0 ? Math.round((studentsWithPhotos / totalStudents) * 100) : 0,
        examsToday,
        totalLecturers,
      },
      attendanceStats: attendanceStats.reduce((acc, curr) => {
        acc[curr.status || 'unknown'] = curr._count._all;
        return acc;
      }, {}),
      methodStats: methodStats.reduce((acc, curr) => {
        acc[curr.attendance_method || 'unknown'] = curr._count._all;
        return acc;
      }, {}),
    };
  }
}
