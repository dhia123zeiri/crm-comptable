import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '@prisma/client';
import { RolesGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/role.decorator';
import { CurrentUser } from 'src/auth/current-user.decorator';
import type { TokenPayload } from 'src/auth/token-payload.interface';
import { CaissesService } from './caisses.service';
import { CreateCaisseDto, UpdateCaisseDto, SaveClientCaissesDto } from './dto/create-caisse.dto';

@Controller('caisses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CaissesController {
  constructor(private readonly caisseService: CaissesService) {}

  // For COMPTABLE: Get caisses by client ID
  @Get('client/:clientId')
  @Roles(Role.COMPTABLE)
  async getCaissesByClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.caisseService.getCaissesByClient(clientId, user.userId);
  }

  // For CLIENT: Get their own caisses
  @Get('my-caisses')
  @Roles(Role.CLIENT)
  async getCaissesByExistClient(@CurrentUser() user: TokenPayload) {
    return this.caisseService.getCaissesByExistClient(user.userId);
  }

  // For COMPTABLE: Get list of clients
  @Get('clients')
  @Roles(Role.COMPTABLE)
  async getClientsByComptable(@CurrentUser() user: TokenPayload) {
    return this.caisseService.getClientsByComptable(user.userId);
  }

  @Post()
  @Roles(Role.COMPTABLE)
  async createCaisse(
    @Body() createCaisseDto: CreateCaisseDto,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.caisseService.createCaisse(createCaisseDto, user.userId);
  }

  @Post('batch-save')
  @Roles(Role.COMPTABLE)
  async saveClientCaisses(
    @Body() saveClientCaissesDto: SaveClientCaissesDto,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.caisseService.saveClientCaisses(saveClientCaissesDto, user.userId);
  }

  @Put(':caisseId')
  @Roles(Role.COMPTABLE)
  async updateCaisse(
    @Param('caisseId', ParseIntPipe) caisseId: number,
    @Body() updateCaisseDto: UpdateCaisseDto,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.caisseService.updateCaisse(caisseId, updateCaisseDto, user.userId);
  }

  @Delete(':caisseId')
  @Roles(Role.COMPTABLE)
  async deleteCaisse(
    @Param('caisseId', ParseIntPipe) caisseId: number,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.caisseService.deleteCaisse(caisseId, user.userId);
  }

  @Get('statistics')
  @Roles(Role.COMPTABLE)
  async getCaisseStatistics(@CurrentUser() user: TokenPayload) {
    return this.caisseService.getCaisseStatistics(user.userId);
  }
}