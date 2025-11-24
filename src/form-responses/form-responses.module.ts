import { Module } from '@nestjs/common';
import { FormResponsesService } from './form-responses.service';
import { FormResponsesController } from './form-responses.controller';
import { PrismaModule } from '../prisma/prisma.module'; // Adjust path as needed

@Module({
  imports: [PrismaModule], // Import the module that provides PrismaService
  controllers: [FormResponsesController],
  providers: [FormResponsesService],
  exports: [FormResponsesService], // Optional: only if other modules need this service
})
export class FormResponsesModule {}