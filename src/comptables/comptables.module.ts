import { Module } from '@nestjs/common';
import { ComptableController } from './comptables.controller';
import { ComptableService } from './comptables.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ComptableController, DashboardController],
  providers: [ComptableService],
  exports: [ComptableService]
})
export class ComptablesModule {}
