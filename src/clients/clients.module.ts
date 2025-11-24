import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientDashboardController } from './client-dashboard.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ClientsController, ClientDashboardController],
  providers: [ClientsService],
  exports: [ClientsService]
})
export class ClientsModule {} 

