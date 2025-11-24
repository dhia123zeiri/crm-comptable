// src/dynamic-forms/controllers/form-responses.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  ParseIntPipe
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

import { Role } from '@prisma/client';
import { Roles } from 'src/auth/role.decorator';
import { RolesGuard } from 'src/auth/guards/role.guard';
import { FormResponsesService } from './form-responses.service';
import { CurrentUser } from 'src/auth/current-user.decorator';
import type { TokenPayload } from 'src/auth/token-payload.interface';


@Controller('form-responses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COMPTABLE)
export class FormResponsesController {
  constructor(private readonly responsesService: FormResponsesService) {}

  /**
   * Get all responses with filters
   */
  @Get()
  async getResponses(
    @CurrentUser() req: TokenPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('formId') formId?: string,
    @Query('clientId') clientId?: string,
    @Query('isRead') isRead?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const filters: any = {};

    if (formId) filters.formId = parseInt(formId);
    if (clientId) filters.clientId = parseInt(clientId);
    if (isRead !== undefined) filters.isRead = isRead === 'true';
    if (status) filters.status = status;
    if (dateFrom) filters.dateFrom = new Date(dateFrom);
    if (dateTo) filters.dateTo = new Date(dateTo);

    return this.responsesService.getResponses(
      req.userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      filters
    );
  }

  /**
   * Get response statistics
   * IMPORTANT: This must come BEFORE @Get(':id')
   */
  @Get('stats')
  async getStats(@CurrentUser() req: TokenPayload) {
    return this.responsesService.getResponseStats(req.userId);
  }

  /**
   * Mark multiple responses as read
   * IMPORTANT: This must come BEFORE @Post(':id/mark-read')
   */
  @Post('mark-read/bulk')
  async markMultipleAsRead(
    @CurrentUser() req: TokenPayload,
    @Body() body: { responseIds: number[] }
  ) {
    return this.responsesService.markMultipleAsRead(
      body.responseIds,
      req.userId
    );
  }

  /**
   * Get a single response by ID
   */
  @Get(':id')
  async getResponseById(
    @CurrentUser() req: TokenPayload,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.responsesService.getResponseById(id, req.userId);
  }

  /**
   * Mark a response as read
   */
  @Post(':id/mark-read')
  async markAsRead(
    @CurrentUser() req: TokenPayload,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.responsesService.markAsRead(id, req.userId);
  }

  /**
   * Mark a response as unread
   */
  @Post(':id/mark-unread')
  async markAsUnread(
    @CurrentUser() req: TokenPayload,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.responsesService.markAsUnread(id, req.userId);
  }

  /**
   * Delete a response
   */
  @Delete(':id')
  async deleteResponse(
    @CurrentUser() req: TokenPayload,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.responsesService.deleteResponse(id, req.userId);
  }
}