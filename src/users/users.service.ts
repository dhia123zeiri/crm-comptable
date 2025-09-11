import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserRequest } from './dto/create-user.request';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private readonly prismaService: PrismaService) {}

    async createUser(data: CreateUserRequest){
        console.log("ok");

    }

    async getUser(filter: Prisma.UserWhereUniqueInput){
        return this.prismaService.user.findUniqueOrThrow({
            where: filter,
        });
    }
}
