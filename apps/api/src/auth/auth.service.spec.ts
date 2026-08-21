import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock };

  const baseUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'PARTICIPANT',
    isActive: true,
    passwordHash: 'hashed',
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => fallback),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('throws Unauthorized for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'x@x.com', password: 'pw' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized for inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });

      await expect(
        service.login({ email: baseUser.email, password: 'pw' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: baseUser.email, password: 'wrong' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens on success and persists a refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(
        { email: baseUser.email, password: 'correct' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      );

      expect(result.user.id).toBe(baseUser.id);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    it('throws Unauthorized when token not found', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('raw-token', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revokes all user tokens on reuse of a revoked token', async () => {
      const revokedRecord = {
        id: 'rt-1',
        userId: baseUser.id,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
        user: baseUser,
      };
      prisma.refreshToken.findUnique.mockResolvedValue(revokedRecord);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh('raw-token', {})).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokes all user tokens on reuse of an expired token', async () => {
      const expiredRecord = {
        id: 'rt-2',
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: baseUser,
      };
      prisma.refreshToken.findUnique.mockResolvedValue(expiredRecord);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh('raw-token', {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('rotates the token inside a transaction on valid refresh', async () => {
      const validRecord = {
        id: 'rt-3',
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        user: baseUser,
      };
      prisma.refreshToken.findUnique.mockResolvedValue(validRecord);

      const txUpdate = jest.fn().mockResolvedValue({});
      const txCreate = jest.fn().mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback({
          refreshToken: { update: txUpdate, create: txCreate },
        }),
      );

      const result = await service.refresh('raw-token', {});

      expect(txUpdate).toHaveBeenCalledWith({
        where: { id: validRecord.id },
        data: { revokedAt: expect.any(Date) },
      });
      expect(txCreate).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('throws Unauthorized when the user has been deactivated', async () => {
      const validRecordInactiveUser = {
        id: 'rt-4',
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        user: { ...baseUser, isActive: false },
      };
      prisma.refreshToken.findUnique.mockResolvedValue(validRecordInactiveUser);

      await expect(service.refresh('raw-token', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('is a no-op when no token provided', async () => {
      await service.logout(undefined);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes the matching non-revoked token', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('getUserById', () => {
    it('throws when user missing or inactive', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserById('u1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns AuthUser shape for active user', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.getUserById(baseUser.id);
      expect(result).toEqual({
        id: baseUser.id,
        email: baseUser.email,
        name: baseUser.name,
        role: baseUser.role,
        isActive: baseUser.isActive,
      });
    });
  });
});