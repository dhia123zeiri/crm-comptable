import { Controller, Get, UseGuards } from '@nestjs/common';
import { ComptableService } from './comptables.service';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { DashboardStats } from './interface/dashboardStats.interface';
import type { TokenPayload } from 'src/auth/token-payload.interface';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('comptables/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(private readonly comptableService:ComptableService){

    }
  @Get('stats')
  async getDashboardStats(@CurrentUser() user: TokenPayload): Promise<DashboardStats>{
    return await this.comptableService.getDashboardStats(user.userId);
  }
}
