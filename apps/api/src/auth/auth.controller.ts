import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import type { AuthUser } from './types/auth-user.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.setRefreshCookie(response, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.setRefreshCookie(response, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.getRefreshToken(request);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const result = await this.authService.refresh(refreshToken, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.setRefreshCookie(response, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.getRefreshToken(request);

    await this.authService.logout(refreshToken);

    this.clearAllCookieVariants(response);

    return {
      success: true,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthUser) {
    return {
      user,
    };
  }

  @Get('admin-check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  adminCheck(@CurrentUser() user: AuthUser) {
    return {
      success: true,
      message: 'Admin authorization successful',
      user,
    };
  }

  private getRefreshToken(request: Request) {
    const cookies = request.cookies as Record<string, string> | undefined;
    const token = cookies?.[this.cookieName()];

    // --- DEBUG LOGGING ---
    console.log(
      `[COOKIE-READ] raw Cookie header="${request.headers.cookie ?? '(none)'}" | parsed value present=${!!token}`,
    );

    return token;
  }

  private setRefreshCookie(response: Response, token: string) {
    // Clear any stale duplicate of this cookie sitting under an older/wider
    // path from before AUTH_COOKIE path was narrowed to '/api/v1/auth'.
    // A same-named cookie at a different path is a DIFFERENT cookie as far
    // as the browser is concerned, and can shadow the fresh one depending
    // on header order + how the server parses duplicates.
    this.clearAllCookieVariants(response);

    response.cookie(this.cookieName(), token, {
      ...this.cookieOptions(),
      maxAge: this.parseCookieMaxAge(),
    });

    // --- DEBUG LOGGING ---
    const hash = createHash('sha256').update(token).digest('hex');
    console.log(
      `[COOKIE-SET] name=${this.cookieName()} path=${this.cookieOptions().path} newTokenHash=${hash.slice(0, 12)}...`,
    );
  }

  private clearAllCookieVariants(response: Response) {
    const base = this.cookieOptions();
    const candidatePaths = ['/', '/api', '/api/v1', '/api/v1/auth'];

    for (const path of candidatePaths) {
      response.clearCookie(this.cookieName(), { ...base, path });
    }
  }

  private cookieName() {
    return this.config.get<string>(
      'AUTH_COOKIE_NAME',
      'hackathon_refresh',
    );
  }

  private cookieOptions() {
    const secure =
      this.config.get<string>('AUTH_COOKIE_SECURE', 'false') === 'true';

    const sameSite = this.config.get<'lax' | 'strict' | 'none'>(
      'AUTH_COOKIE_SAME_SITE',
      'lax',
    );

    const domain = this.config.get<string>('AUTH_COOKIE_DOMAIN') || undefined;

    return {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/api/v1/auth',
    } as const;
  }

  private parseCookieMaxAge() {
    const ttl = this.config.get<string>('JWT_REFRESH_TTL', '7d');
    const match = ttl.match(/^(\d+)([smhd])$/);

    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return amount * multipliers[match[2]];
  }
}