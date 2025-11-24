import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Put } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/role.decorator';
import { CurrentUser } from 'src/auth/current-user.decorator';
import type { TokenPayload } from 'src/auth/token-payload.interface';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async create(@Body() createClientDto: CreateClientDto, @CurrentUser() user: TokenPayload) {
    return this.clientsService.create(createClientDto, user.userId);
  }

  @Get()
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async findAll(@CurrentUser() user: TokenPayload) {
    return this.clientsService.findAllByComptable(user.userId);
  }

  @Get(':id')
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async findOne(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.clientsService.findOne(+id, user.userId);
  }

  @Put(':id')
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @CurrentUser() user: TokenPayload
  ) {
    return this.clientsService.update(+id, updateClientDto, user.userId);
  }

  @Delete(':id')
  @Roles(Role.COMPTABLE, Role.ADMIN)
  async remove(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.clientsService.softDelete(+id, user.userId);
  }
}