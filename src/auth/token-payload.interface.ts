import { Role } from "@prisma/client";

export interface TokenPayload {
  userId: number;
  nom: string
  email: string;
  role: Role;
}