import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

// Key used by RolesGuard to read metadata
export const ROLES_KEY = 'roles';

// Usage: @Roles(Role.ADMIN, Role.COMPTABLE)
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
