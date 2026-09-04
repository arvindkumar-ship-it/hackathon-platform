import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthUser } from './types/auth-user.type';
import { JwtPayload } from './types/jwt-payload.type';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    dto: LoginDto,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone ?? undefined,
      role: user.role,
      isActive: user.isActive,
    };

    const tokens = await this.issueTokenPair(authUser, metadata);

    console.log(
      `[LOGIN] user=${authUser.email} issued refreshToken hash=${this.hashToken(tokens.refreshToken).slice(0, 12)}...`,
    );

    return {
      user: authUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async register(
    dto: RegisterDto,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const defaultEventSlug = this.config.get<string>('DEFAULT_EVENT_SLUG');

    const event = defaultEventSlug
      ? await this.prisma.event.findUnique({ where: { slug: defaultEventSlug } })
      : null;

    if (defaultEventSlug && !event) {
      throw new ConflictException('Default event is not configured correctly');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const teamName = this.buildTeamName(dto.name);

    const authUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          phone: dto.phone?.trim(),
          passwordHash,
        },
      });

      if (event) {
        await tx.eventMember.create({
          data: { eventId: event.id, userId: user.id, status: 'ACTIVE' },
        });

        const team = await tx.team.create({
          data: { eventId: event.id, name: teamName },
        });

        await tx.teamMember.create({
          data: { teamId: team.id, userId: user.id, role: 'LEADER' },
        });
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone ?? undefined,
        role: user.role,
        isActive: user.isActive,
      } satisfies AuthUser;
    });

    const tokens = await this.issueTokenPair(authUser, metadata);

    return {
      user: authUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private buildTeamName(rawName: string): string {
    const sanitized = rawName
      .trim()
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .replace(/^[^a-zA-Z0-9]+/, '');

    const base = sanitized.length >= 2 ? sanitized : 'Team';

    return `${base} ${randomBytes(3).toString('hex')}`.slice(0, 100);
  }

  async refresh(
    rawRefreshToken: string,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    // --- DEBUG LOGGING START ---
    if (!rawRefreshToken) {
      console.log('[REFRESH] FAILED: no refresh token cookie received by backend at all.');
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    console.log(`[REFRESH] incoming cookie hash=${tokenHash.slice(0, 12)}... at ${new Date().toISOString()}`);
    // --- DEBUG LOGGING END ---

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      console.log('[REFRESH] FAILED: no matching refreshToken row in DB for this hash — token unknown/already deleted.');
      throw new UnauthorizedException('Invalid refresh token');
    }

    console.log(
      `[REFRESH] found row id=${storedToken.id} user=${storedToken.user.email} revokedAt=${storedToken.revokedAt} expiresAt=${storedToken.expiresAt.toISOString()} now=${new Date().toISOString()}`,
    );

    if (storedToken.revokedAt || storedToken.expiresAt <= new Date()) {
      console.log(
        `[REFRESH] FAILED: token ${storedToken.revokedAt ? 'already revoked at ' + storedToken.revokedAt.toISOString() : 'expired'} — revoking all tokens for user ${storedToken.userId}.`,
      );
      await this.revokeAllUserTokens(storedToken.userId);
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    const user = storedToken.user;

    if (!user.isActive) {
      console.log(`[REFRESH] FAILED: user ${user.email} is inactive.`);
      throw new UnauthorizedException('User is inactive');
    }

    console.log(`[REFRESH] SUCCESS for user=${user.email} — issuing new token pair.`);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone ?? undefined,
      role: user.role,
      isActive: user.isActive,
    };

    return this.prisma.$transaction(async (transaction) => {
      await transaction.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      const payload: JwtPayload = {
        sub: authUser.id,
        email: authUser.email,
        role: authUser.role,
        type: 'access',
      };

      const accessToken = await this.jwt.signAsync(payload);
      const refreshToken = randomBytes(64).toString('base64url');

      await transaction.refreshToken.create({
        data: {
          userId: authUser.id,
          tokenHash: this.hashToken(refreshToken),
          expiresAt: this.calculateExpiry(
            this.config.get<string>('JWT_REFRESH_TTL', '7d'),
          ),
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
        },
      });

      return { user: authUser, accessToken, refreshToken };
    });
  }

  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken) return;

    const tokenHash = this.hashToken(rawRefreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getUserById(id: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or unavailable');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone ?? undefined,
      role: user.role,
      isActive: user.isActive,
    };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.config.get<number>('ARGON2_MEMORY_COST', 19456),
      timeCost: this.config.get<number>('ARGON2_TIME_COST', 2),
      parallelism: this.config.get<number>('ARGON2_PARALLELISM', 1),
    });
  }

  private async issueTokenPair(
    user: AuthUser,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(64).toString('base64url');
    const tokenHash = this.hashToken(refreshToken);

    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '7d');
    const expiresAt = this.calculateExpiry(refreshTtl);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    });

    return { accessToken, refreshToken, expiresAt, user };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private calculateExpiry(ttl: string): Date {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new ConflictException('Invalid JWT_REFRESH_TTL configuration');
    }
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000,
    };
    return new Date(Date.now() + amount * multipliers[unit]);
  }

  private async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}