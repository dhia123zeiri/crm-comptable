import { Module } from '@nestjs/common';
import { ComptableController } from './comptables.controller';
import { ComptableService } from './comptables.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ComptableController],
  providers: [ComptableService],
  exports: [ComptableService]
})
export class ComptablesModule {}
