import { BadRequestException, Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

@Injectable()
export class FormSecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(FormSecurityMiddleware.name);
  
  private rateLimiter = new RateLimiterMemory({
    points: 5, // 5 tentatives
    duration: 300, // par 5 minutes (en secondes)
    blockDuration: 300, // bloqué pendant 5 minutes
  });

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // Rate limiting par IP - créer la clé manuellement
      const rateLimitKey = `form_${req.ip}`;
      await this.rateLimiter.consume(rateLimitKey);
      
      // Extract token from URL path instead of req.params
      let token: string | null = null;
      
      // For routes like /dynamic-forms/token/:token
      if (req.path.includes('/dynamic-forms/token/')) {
        const pathParts = req.path.split('/');
        const tokenIndex = pathParts.findIndex(part => part === 'token') + 1;
        token = pathParts[tokenIndex];
      }
      // For routes like /dynamic-forms/submit/:token  
      else if (req.path.includes('/dynamic-forms/submit/')) {
        const pathParts = req.path.split('/');
        const submitIndex = pathParts.findIndex(part => part === 'submit') + 1;
        token = pathParts[submitIndex];
      }
      // For routes like /dynamic-forms/status/:token
      else if (req.path.includes('/dynamic-forms/status/')) {
        const pathParts = req.path.split('/');
        const statusIndex = pathParts.findIndex(part => part === 'status') + 1;
        token = pathParts[statusIndex];
      }

      // Validation du token format
      if (!token || typeof token !== 'string' || token.length < 10) {
        this.logger.warn(`Invalid token format from IP: ${req.ip}, extracted token: ${token}`);
        throw new BadRequestException('Token invalide');
      }

      // Optional: Add UUID format validation for stronger security
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(token)) {
        this.logger.warn(`Invalid UUID format from IP: ${req.ip}, token: ${token}`);
        throw new BadRequestException('Format de token invalide');
      }

      // Validation des headers de sécurité
      const userAgent = req.headers['user-agent'];
      if (!userAgent || userAgent.length < 10) {
        this.logger.warn(`Suspicious request detected from IP: ${req.ip}`);
        throw new BadRequestException('Requête suspecte détectée');
      }

      // Validation de la méthode HTTP pour les routes spécifiques
      if (req.path.includes('/submit/') && req.method !== 'POST') {
        throw new BadRequestException('Méthode HTTP non autorisée');
      }

      // Ajouter headers de sécurité
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

      // Log successful access (sans données sensibles)
      this.logger.debug(`Form access: ${req.method} ${req.path} from ${req.ip}, token: ${token.substring(0, 8)}...`);

      next();
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof Error) {
        throw rateLimiterRes;
      }
      
      // rateLimiterRes contient des infos sur le rate limit
      const remainingPoints = rateLimiterRes.remainingPoints || 0;
      const msBeforeNext = rateLimiterRes.msBeforeNext || 0;
      
      this.logger.warn(`Rate limit exceeded for IP: ${req.ip}, retry in ${Math.round(msBeforeNext / 1000)}s`);
      
      throw new BadRequestException(
        `Trop de tentatives. Réessayez dans ${Math.ceil(msBeforeNext / 1000)} secondes.`
      );
    }
  }
}