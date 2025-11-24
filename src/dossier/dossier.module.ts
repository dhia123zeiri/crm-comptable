import { Module } from '@nestjs/common';
import { DossierService } from './dossier.service';
import { ClientDossierController, DossierController, DossierWebhookController } from './dossier.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
   imports: [PrismaModule,
       MulterModule.register({
         dest: './uploads/dossiers',
       }),],
  providers: [DossierService],
  controllers: [DossierController, ClientDossierController, DossierWebhookController],

  exports: [DossierService]
})
export class DossierModule {}
