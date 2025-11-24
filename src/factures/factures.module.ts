import { Module } from '@nestjs/common';
import { FacturesService } from './factures.service';
import { FacturesController } from './factures.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FacturesService],
  controllers: [FacturesController],
  exports: [FacturesService]
})
export class FacturesModule {}
