import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateCaisseDto, UpdateCaisseDto, SaveClientCaissesDto } from './dto/create-caisse.dto';

export interface CaisseStatistics {
  totalCaisses: number;
  activeCaisses: number;
  inactiveCaisses: number;
  caissesByType: { nom: string; count: number }[];
  clientsWithCaisses: number;
}

export interface ClientCaissesResponse {
  id: number;
  raisonSociale: string;
  siret: string;
  caisses: any[];
  isFullyConfigured: boolean;
  configuredCount: number;
  activeCount: number;
}

@Injectable()
export class CaissesService {
 
  constructor(private prisma: PrismaService) {}

  // Get caisses for specific client with enhanced response
  async getCaissesByClient(clientId: number, comptableId: number): Promise<ClientCaissesResponse> {
    // Check if user is comptable and has access to this client
    await this.validateComptableAccess(comptableId, clientId);

    // Get client info
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        raisonSociale: true,
        siret: true,
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Get caisses for this client
    const caisses = await this.prisma.caisse.findMany({
      where: {
        clientId,
        comptableId: comptableId,
      },
      select: {
        id: true,
        nom: true,
        username: true,
        password: false, // Never return actual passwords
        isActive: true,
        dateCreation: true,
        dateModification: true,
        clientId: true,
        comptableId: true,
      },
      orderBy: {
        nom: 'asc',
      },
    });

    // Calculate statistics
    const activeCount = caisses.filter(c => c.isActive).length;
    const configuredCount = caisses.filter(c => c.username && c.username.trim() !== '').length;
    
    // Consider fully configured if at least one caisse is active and configured
    const isFullyConfigured = activeCount > 0 && configuredCount > 0;

    return {
      id: client.id,
      raisonSociale: client.raisonSociale,
      siret: client.siret,
      caisses: caisses,
      isFullyConfigured,
      configuredCount,
      activeCount,
    };
  }

  // Batch save caisses for a client
  async saveClientCaisses(data: SaveClientCaissesDto, userId: number) {
    // Validate comptable access to client
    await this.validateComptableAccess(userId, data.clientId);

    const results: any[] = [];

    for (const caisseData of data.caisses) {
      try {
        if (caisseData.id) {
          // Update existing caisse
          const updated = await this.updateCaisse(caisseData.id, {
            nom: caisseData.nom,
            username: caisseData.username,
            password: caisseData.password,
            isActive: caisseData.isActive,
          }, userId);
          results.push(updated);
        } else {
          // Create new caisse
          const created = await this.createCaisse({
            nom: caisseData.nom,
            username: caisseData.username,
            password: caisseData.password,
            isActive: caisseData.isActive,
            clientId: caisseData.clientId,
          }, userId);
          results.push(created);
        }
      } catch (error) {
        // If it's a duplicate error, try to find and update existing
        if (error.message?.includes('already exists')) {
          const existingCaisse = await this.prisma.caisse.findUnique({
            where: {
              clientId_nom: {
                clientId: caisseData.clientId,
                nom: caisseData.nom,
              },
            },
          });

          if (existingCaisse) {
            const updated = await this.updateCaisse(existingCaisse.id, {
              username: caisseData.username,
              password: caisseData.password,
              isActive: caisseData.isActive,
            }, userId);
            results.push(updated);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    return results;
  }

  // Get clients by comptable (for the dropdown)
  async getClientsByComptable(userId: number) {
    const clients = await this.prisma.client.findMany({
      where: {
        comptableId: userId,
      },
      select: {
        id: true,
        raisonSociale: true,
        siret: true,
      },
      orderBy: {
        raisonSociale: 'asc',
      },
    });

    // For each client, check if they have configured caisses
    const clientsWithStatus = await Promise.all(
      clients.map(async (client) => {
        const caisses = await this.prisma.caisse.findMany({
          where: {
            clientId: client.id,
            comptableId: userId,
          },
          select: {
            isActive: true,
            username: true,
          },
        });

        const activeCount = caisses.filter(c => c.isActive).length;
        const configuredCount = caisses.filter(c => c.username && c.username.trim() !== '').length;
        const isFullyConfigured = activeCount > 0 && configuredCount > 0;

        return {
          ...client,
          isFullyConfigured,
        };
      })
    );

    return clientsWithStatus;
  }

  // Create new caisse
  async createCaisse(data: CreateCaisseDto, userId: number) {
    // Validate comptable access to client
    await this.validateComptableAccess(userId, data.clientId);

    // Check if caisse with same name already exists for this client
    const existingCaisse = await this.prisma.caisse.findUnique({
      where: {
        clientId_nom: {
          clientId: data.clientId,
          nom: data.nom,
        },
      },
    });

    if (existingCaisse) {
      throw new ForbiddenException(
        `Caisse ${data.nom} already exists for this client`
      );
    }

    return this.prisma.caisse.create({
      data: {
        ...data,
        comptableId: userId,
        // Encrypt password if provided
        password: data.password ? await this.encryptPassword(data.password) : null,
      },
      include: {
        client: {
          select: {
            id: true,
            raisonSociale: true,
            siret: true,
          },
        },
      },
    });
  }

  // Update specific caisse
  async updateCaisse(caisseId: number, data: UpdateCaisseDto, userId: number) {
    // First, find the caisse and validate access
    const caisse = await this.prisma.caisse.findUnique({
      where: { id: caisseId },
      include: {
        client: true,
      },
    });

    if (!caisse) {
      throw new NotFoundException('Caisse not found');
    }

    // Validate comptable access
    await this.validateComptableAccess(userId, caisse.clientId);

    // If updating name, check for duplicates
    if (data.nom && data.nom !== caisse.nom) {
      const existingCaisse = await this.prisma.caisse.findUnique({
        where: {
          clientId_nom: {
            clientId: caisse.clientId,
            nom: data.nom,
          },
        },
      });

      if (existingCaisse) {
        throw new ForbiddenException(
          `Caisse ${data.nom} already exists for this client`
        );
      }
    }

    const updateData: any = {
      ...data,
    };

    // Encrypt password if provided
    if (data.password) {
      updateData.password = await this.encryptPassword(data.password);
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );

    return this.prisma.caisse.update({
      where: { id: caisseId },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            raisonSociale: true,
            siret: true,
          },
        },
      },
    });
  }

  // Delete caisse
  async deleteCaisse(caisseId: number, userId: number) {
    // First, find the caisse and validate access
    const caisse = await this.prisma.caisse.findUnique({
      where: { id: caisseId },
      include: {
        client: true,
      },
    });

    if (!caisse) {
      throw new NotFoundException('Caisse not found');
    }

    // Validate comptable access
    await this.validateComptableAccess(userId, caisse.clientId);

    await this.prisma.caisse.delete({
      where: { id: caisseId },
    });

    return { message: 'Caisse deleted successfully' };
  }

  // Get caisse statistics
  async getCaisseStatistics(userId: number): Promise<CaisseStatistics> {
    // Get all caisses for this comptable
    const caisses = await this.prisma.caisse.findMany({
      where: {
        comptableId: userId,
      },
      include: {
        client: true,
      },
    });

    const totalCaisses = caisses.length;
    const activeCaisses = caisses.filter(c => c.isActive).length;
    const inactiveCaisses = totalCaisses - activeCaisses;

    // Group caisses by name (type)
    const caissesByTypeMap = new Map<string, number>();
    caisses.forEach(caisse => {
      const count = caissesByTypeMap.get(caisse.nom) || 0;
      caissesByTypeMap.set(caisse.nom, count + 1);
    });

    const caissesByType = Array.from(caissesByTypeMap.entries()).map(
      ([nom, count]) => ({ nom, count })
    );

    // Count unique clients with caisses
    const uniqueClientIds = new Set(caisses.map(c => c.clientId));
    const clientsWithCaisses = uniqueClientIds.size;

    return {
      totalCaisses,
      activeCaisses,
      inactiveCaisses,
      caissesByType,
      clientsWithCaisses,
    };
  }

  // Private helper methods
  private async validateComptableAccess(userId: number, clientId: number) {
    // Verify the client belongs to this comptable
    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        comptableId: userId,
      },
    });

    if (!client) {
      throw new ForbiddenException('Access denied. Client not found or not associated with your account.');
    }
  }

  // Add this method to your existing CaissesService class

  // Get caisses for the currently connected client
  async getCaissesByExistClient(userId: number): Promise<ClientCaissesResponse> {
    try {
      console.log(`Fetching client for userId: ${userId}`);
      
      // First, get the client record from the user ID
      const client = await this.prisma.client.findUnique({
        where: { userId: userId },
        select: {
          id: true,
          raisonSociale: true,
          siret: true,
          comptableId: true,
        },
      });

      if (!client) {
        console.log(`No client found for userId: ${userId}`);
        throw new NotFoundException('Client profile not found');
      }

      console.log(`Found client: ${JSON.stringify(client)}`);

      // Get caisses for this client
      const caisses = await this.prisma.caisse.findMany({
        where: {
          clientId: client.id,
        },
        select: {
          id: true,
          nom: true,
          username: true,
          password: true, // Client can see their own passwords (decrypted)
          isActive: true,
          dateCreation: true,
          dateModification: true,
          clientId: true,
          comptableId: true,
        },
        orderBy: {
          nom: 'asc',
        },
      });

      console.log(`Found ${caisses.length} caisses for client ${client.id}`);

      // Decrypt passwords for client view (only if password exists and encryption is set up)
      const caissesWithDecryptedPasswords = await Promise.all(
        caisses.map(async (caisse) => {
          try {
            return {
              ...caisse,
              password: caisse.password ? await this.decryptPassword(caisse.password) : null,
            };
          } catch (decryptError) {
            console.error(`Failed to decrypt password for caisse ${caisse.id}:`, decryptError);
            // Return the caisse with null password if decryption fails
            return {
              ...caisse,
              password: null,
            };
          }
        })
      );

      // Calculate statistics
      const activeCount = caissesWithDecryptedPasswords.filter(c => c.isActive).length;
      const configuredCount = caissesWithDecryptedPasswords.filter(c => c.username && c.username.trim() !== '').length;
      
      // Consider fully configured if at least one caisse is active and configured
      const isFullyConfigured = activeCount > 0 && configuredCount > 0;

      const result = {
        id: client.id,
        raisonSociale: client.raisonSociale,
        siret: client.siret,
        caisses: caissesWithDecryptedPasswords,
        isFullyConfigured,
        configuredCount,
        activeCount,
      };

      console.log(`Returning result for client ${client.id}:`, JSON.stringify(result, null, 2));
      
      return result;
      
    } catch (error) {
      console.error('Error in getCaissesByExistClient:', error);
      throw error;
    }
  }

  // Private helper method to decrypt password using AES encryption
  private async decryptPassword(encryptedPassword: string): Promise<string> {
    // Check if encryption key is configured
    const secretKey = process.env.ENCRYPTION_KEY;
    
    if (!secretKey) {
      console.warn('ENCRYPTION_KEY not configured, returning encrypted password as-is');
      return encryptedPassword;
    }

    // Check if the password is in the new encrypted format (has colons)
    if (!encryptedPassword.includes(':')) {
      console.warn('Password appears to be in old format (bcrypt), cannot decrypt');
      return '***ENCRYPTED***'; // Return placeholder for old bcrypt passwords
    }

    try {
      const crypto = require('crypto');
      const algorithm = 'aes-256-gcm';
      
      const parts = encryptedPassword.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted password format - expected 3 parts separated by colons');
      }
      
      const [encrypted, iv, tag] = parts;
      
      if (!encrypted || !iv || !tag) {
        throw new Error('Invalid encrypted password format - missing parts');
      }
      
      const decipher = crypto.createDecipherGCM(algorithm, Buffer.from(secretKey, 'hex'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Password decryption error:', error.message);
      return '***DECRYPTION_FAILED***'; // Return placeholder if decryption fails
    }
  }

  // Updated encrypt method using symmetric encryption instead of bcrypt
  private async encryptPasswordSymmetric(password: string): Promise<string> {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const secretKey = process.env.ENCRYPTION_KEY;
    
    if (!secretKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required for password encryption');
    }
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipherGCM(algorithm, Buffer.from(secretKey, 'hex'));
      
      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return `${encrypted}:${iv.toString('hex')}:${tag.toString('hex')}`;
    } catch (error) {
      console.error('Password encryption error:', error);
      throw new Error('Failed to encrypt password');
    }
  }

  private async encryptPassword(password: string): Promise<string> {
  return this.encryptPasswordSymmetric(password);
}
}