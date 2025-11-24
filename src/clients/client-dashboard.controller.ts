import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ClientsService } from './clients.service';
import type { TokenPayload } from 'src/auth/token-payload.interface';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { ClientDashboardStats } from './interface/clientDashboardStats.interface';

@Controller('client-dashboard')
@UseGuards(JwtAuthGuard)
export class ClientDashboardController {
    constructor(private readonly clientService:ClientsService){
    
        }

    @Get('stats')
      async getDashboardStats(@CurrentUser() user: TokenPayload): Promise<ClientDashboardStats>{
        return await this.clientService.getDashboardStats(user.userId);
      }
}
