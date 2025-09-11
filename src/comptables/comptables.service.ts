import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateComptableRequest } from './dto/create-comptable.request';

@Injectable()
export class ComptableService {
  constructor(private readonly prisma: PrismaService) {}

  async createComptable(data: CreateComptableRequest) {
    try {
      // Transformer la chaîne en tableau
      const specialitesArray =
        typeof data.specialites === 'string'
          ? data.specialites
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0)
          : [];
      console.log(specialitesArray);

      return await this.prisma.user.create({
        data: {
          nom: data.nom,
          email: data.email,
          password: await bcrypt.hash(data.password, 10),
          role: 'COMPTABLE',
          comptable: {
            create: {
              cabinet: data.cabinet,
              specialites: specialitesArray,
              numeroOrdre: data.numeroOrdre || null,
            },
          },
        },
        include: {
          comptable: true,
        },
      });
    } catch (err) {
      console.error(err);
      if (err.code === 'P2002') {
        throw new UnprocessableEntityException('Email already exists');
      }
      throw err;
    }
  }
}
