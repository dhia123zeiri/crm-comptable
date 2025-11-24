// ============================================
// factures.controller.ts
// ============================================
import { Controller, Get, Post, Body, Param, UseGuards, ParseIntPipe, Query, Res, StreamableFile } from '@nestjs/common';
import { FacturesService } from './factures.service';
import { RolesGuard } from 'src/auth/guards/role.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/auth/role.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from 'src/auth/current-user.decorator';
import type { TokenPayload } from 'src/auth/token-payload.interface';
import { CreateFactureDto } from './dto/create-facture.dto';



@Controller('factures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacturesController {
  constructor(private readonly facturesService: FacturesService) {}

  // ============================================
  // CLIENT ENDPOINTS (doivent être avant les routes dynamiques)
  // ============================================

  @Get('client/mes-factures')
  @Roles(Role.CLIENT)
  async getClientFactures(@CurrentUser() user: TokenPayload) {
    return this.facturesService.findClientFactures(user.userId);
  }

  @Get('client/facture/:id')
  @Roles(Role.CLIENT)
  async getClientFacture(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.facturesService.findClientFacture(user.userId, id);
  }

 @Get(':id/pdf')
@Roles(Role.COMPTABLE, Role.ADMIN, Role.CLIENT)
async downloadPDF(
  @CurrentUser() user: TokenPayload,
  @Param('id', ParseIntPipe) id: number,
  @Res({ passthrough: true }) res: any
): Promise<StreamableFile>{
  // Check if user is comptable or client who owns this facture
  let facture;
  if (user.role === Role.CLIENT) {
    facture = await this.facturesService.findClientFacture(user.userId, id);
  } else {
    facture = await this.facturesService.findOne(user.userId, id);
  }

  // Generate PDF buffer
  const pdfBuffer = await this.facturesService.generatePDF(facture);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="facture-${facture.numero}.pdf"`,
  });

  return new StreamableFile(pdfBuffer);
}

  // ============================================
  // COMPTABLE ENDPOINTS
  // ============================================

  @Get('cabinet')
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async getCabinetInfo(@CurrentUser() user: TokenPayload) {
    return this.facturesService.getCabinetInfo(user.userId);
  }

  @Get('comptable/client/:clientId')
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async getClientInfo(
    @CurrentUser() user: TokenPayload,
    @Param('clientId', ParseIntPipe) clientId: number
  ) {
    return this.facturesService.getClientInfo(user.userId, clientId);
  }

  @Post()
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async create(
    @CurrentUser() user: TokenPayload,
    @Body() createFactureDto: CreateFactureDto
  ) {
    return this.facturesService.create(user.userId, createFactureDto);
  }

  @Get()
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async findAll(
    @CurrentUser() user: TokenPayload,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string
  ) {
    return this.facturesService.findAll(
      user.userId,
      status,
      clientId ? parseInt(clientId) : undefined
    );
  }

  @Get(':id')
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async findOne(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.facturesService.findOne(user.userId, id);
  }
}