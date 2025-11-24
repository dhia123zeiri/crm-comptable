import { Body, Controller, Post, UseGuards, Get, Param, Put, Delete, Query, Patch, UseInterceptors } from '@nestjs/common';
import { CurrentUser } from 'src/auth/current-user.decorator';
import type { TokenPayload } from 'src/auth/token-payload.interface';
import { CreateTemplateDto, DuplicateTemplateDto, TemplateFiltersDto, UpdateTemplateDto } from './dto/template.request';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { TemplateEmailsService } from './services/template-emails.service';

@Controller('template-emails')
@UseGuards(JwtAuthGuard)
export class TemplateEmailsController {
    constructor(private readonly templateService: TemplateEmailsService) {}

    @Post()
    async create(
        @Body() createTemplateDto: CreateTemplateDto,
        @CurrentUser() user: TokenPayload
    ) {
        console.log(createTemplateDto);
        return await this.templateService.create(createTemplateDto, user.userId);
    }

    @Post(':id/duplicate')
    async duplicate(
        @Param('id') id: string,
        @Body() duplicateTemplateDto: DuplicateTemplateDto,
        @CurrentUser() user: TokenPayload
    ) {
        return await this.templateService.duplicate(+id, duplicateTemplateDto, user.userId);
    }

    @Get()
    async findAll() {
        return await this.templateService.findAll();
    }

    // IMPORTANT: All specific routes must come BEFORE parameterized routes like ':id'
    @Get('stats')
    async getStats(
        @CurrentUser() user: TokenPayload
    ) {
        return await this.templateService.getStats(user.userId);
    }

    @Get('categories')
    async getCategories(
        @CurrentUser() user: TokenPayload
    ) {
        return await this.templateService.getCategories(user.userId);
    }

    // ADD THIS: clients route MUST come before :id route
    @Get('clients')
    async getClients(
        @CurrentUser() user: TokenPayload
    ) {
        return await this.templateService.getAvailableClients(user.userId);
    }

    // This parameterized route MUST come AFTER all specific routes
    @Get(':id')
    async findOne(
        @Param('id') id: string
    ) {
        return await this.templateService.findOne(+id);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() updateTemplateDto: UpdateTemplateDto,
        @CurrentUser() user: TokenPayload
    ) {
        return await this.templateService.update(+id, updateTemplateDto, user.userId);
    }

    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @CurrentUser() user: TokenPayload
    ) {
        return await this.templateService.remove(+id, user.userId);
    }

    @Patch(':id/toggle-status')
    async toggleStatus(
        @Param('id') id: string,
        @CurrentUser() user: TokenPayload
    ) {
        return await this.templateService.toggleStatus(+id, user.userId);
    }

    @Patch(':id/increment-usage')
    async incrementUsage(
        @Param('id') id: string
    ) {
        return await this.templateService.incrementUsage(+id);
    }
}