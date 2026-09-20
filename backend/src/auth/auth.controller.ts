import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { OidcAuthGuard } from './oidc-auth.guard.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  // Kick off the Authentik OIDC flow (guard redirects to Authentik).
  @Public()
  @UseGuards(OidcAuthGuard)
  @Get('login')
  login(): void {
    // handled by the guard (redirect)
  }

  // OIDC redirect target — on success the session is established → back to the UI.
  @Public()
  @UseGuards(OidcAuthGuard)
  @Get('callback')
  callback(@Res() res: Response): void {
    res.redirect(this.config.get<string>('frontendUrl')!);
  }

  // The current admin (session required by the global guard).
  @Get('me')
  me(@Req() req: Request): Express.User | undefined {
    return req.user;
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    req.logout((err) => {
      if (err) {
        res.status(500).json({ error: 'logout failed' });
        return;
      }
      req.session?.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(204).send();
      });
    });
  }
}
