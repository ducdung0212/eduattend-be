import { ExecutionContext, ForbiddenException, CanActivate, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class ExamScheduleOwnerGuard implements CanActivate {
    constructor(private prisma: PrismaService) { }
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        
        if(user.role === 'admin') return true;

        const exam_schedule_id = request.body?.exam_schedule_id || request.query?.exam_schedule_id || request.params?.id;

        if(user.role === 'lecturer'){
            const supervisor =await this.prisma.examSupervisor.findFirst({
                where:{
                    exam_schedule_id,
                    lecturer_code:user.lecturer_code
                }
            })
            if(!supervisor){
                throw new ForbiddenException("Bạn không phải giám thị của ca thi này");
            }
        }
        return true;
    }
}