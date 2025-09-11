import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { NoFilesInterceptor } from '@nestjs/platform-express';
import { CreateComptableRequest } from './dto/create-comptable.request';
import { ComptableService } from './comptables.service';

@Controller('comptables')
export class ComptableController {
  constructor(private readonly comptableService: ComptableService) {}

  @Post()
  @UseInterceptors(NoFilesInterceptor())
  createComptable(@Body() request: CreateComptableRequest) {
    return this.comptableService.createComptable(request);
  }
}
