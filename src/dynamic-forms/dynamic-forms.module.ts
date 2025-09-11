import { Module } from '@nestjs/common';
import { DynamicFormsService } from './dynamic-forms.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DynamicFormsController } from './dynamic-forms.controller';
import { TemplateEmailsModule } from 'src/template-emails/template-emails.module';

@Module({
  imports: [PrismaModule,
    TemplateEmailsModule
  ],
  providers: [DynamicFormsService],
  controllers: [DynamicFormsController]
})
export class DynamicFormsModule {}
