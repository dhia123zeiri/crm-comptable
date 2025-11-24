import { Module } from '@nestjs/common';
import { DynamicFormsService } from './dynamic-forms.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DynamicFormsController } from './dynamic-forms.controller';
import { TemplateEmailsModule } from 'src/template-emails/template-emails.module';
import { FormResponsesController } from 'src/form-responses/form-responses.controller';
import { FormResponsesService } from 'src/form-responses/form-responses.service';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [PrismaModule,
    TemplateEmailsModule,
    MulterModule.register({
      dest: './uploads/form-responses',
    }),
  ],
  providers: [DynamicFormsService,FormResponsesService],
  controllers: [DynamicFormsController,FormResponsesController],
  exports: [DynamicFormsService, FormResponsesService],
})
export class DynamicFormsModule {}
