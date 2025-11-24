import { Module } from '@nestjs/common';
import { CaissesService } from './caisses.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CaissesController } from './caisses.controller';

@Module({
   imports: [PrismaModule],
  providers: [CaissesService],
  controllers: [CaissesController],
})
export class CaissesModule {}
