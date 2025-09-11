// form.controller.ts
import { Controller, Get, Post, Body, Param, Ip, Headers, BadRequestException, NotFoundException } from '@nestjs/common';
import { DynamicFormsService } from './dynamic-forms.service';
import type{ FormSubmissionDto } from './interfaces/form-submission.interface';




@Controller('dynamic-forms')
export class DynamicFormsController {
  constructor(
    private readonly dynamicFormService:DynamicFormsService
  ) {}

  /**
   * Récupère un formulaire par token sécurisé
   * Route publique accessible aux clients
   */
  @Get('token/:token')
  async getFormByToken(@Param('token') token: string) {
    return await this.dynamicFormService.getFormByToken(token);
  }

  /**
   * Soumission sécurisée du formulaire par le client
   * Route publique avec validation stricte
   */
   @Post('submit/:token')
  async submitForm(
    @Param('token') token: string,
    @Body() submitData: FormSubmissionDto,
    @Ip() clientIp: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return await this.dynamicFormService.handleSubmitForm(
      token,
      submitData,
      clientIp,
      userAgent
    );
  }

  /**
   * Vérification de statut du formulaire (optionnel)
   */
  @Get('status/:token')
  async getFormStatus(@Param('token') token: string) {
    return await this.dynamicFormService.handleGetFormStatus(token);
  }
}

