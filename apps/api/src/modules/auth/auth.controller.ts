import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthService, type ActorContext, type IssuedSession } from './auth.service';
import {
  AcceptInvitationDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterRestaurantDto,
  ResetPasswordDto,
  SwitchTenantDto,
} from './auth.dto';
import { Public, CurrentStaff, CurrentPrincipal } from './decorators';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies';
import { env } from '../../config/env';
import type { Principal, StaffPrincipal } from './principal';

function actorFrom(req: Request): ActorContext {
  return {
    ipAddress: req.ip,
    userAgent: req.header('user-agent'),
    requestId: (req as Request & { requestId?: string }).requestId,
  };
}

function applyCookies(res: Response, session: IssuedSession): void {
  setAuthCookies(res, session);
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, actorFrom(req));
    applyCookies(res, result.session);
    return {
      user: result.user,
      tenantId: result.tenantId,
      csrfToken: result.session.csrfToken,
      accessTokenExpiresAt: result.session.accessExpiresAt,
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create a restaurant and its owner account' })
  async register(
    @Body() dto: RegisterRestaurantDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.registerRestaurant(dto, actorFrom(req));
    applyCookies(res, result.session);
    return { user: result.user, tenantId: result.tenantId, csrfToken: result.session.csrfToken };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    try {
      const session = await this.auth.refresh(token, actorFrom(req));
      applyCookies(res, session);
      return { csrfToken: session.csrfToken, accessTokenExpiresAt: session.accessExpiresAt };
    } catch (error) {
      clearAuthCookies(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const accessToken =
      req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? (req.cookies?.tt_at as string | undefined);
    let sessionId: string | undefined;
    if (accessToken) {
      try {
        const payload = await this.jwt.verifyAsync<{ sid?: string }>(accessToken, {
          secret: env.accessSecret,
          ignoreExpiration: true,
        });
        sessionId = payload.sid;
      } catch {
        sessionId = undefined;
      }
    }
    await this.auth.logout(sessionId, actorFrom(req));
    clearAuthCookies(res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user, restaurant, role and permissions' })
  async me(@CurrentPrincipal() principal: Principal) {
    if (principal.kind === 'customer') {
      throw new UnauthorizedException({ message: 'Staff session required', code: 'STAFF_REQUIRED' });
    }
    return this.auth.me(principal);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the current user' })
  async sessions(@CurrentStaff() principal: StaffPrincipal) {
    return this.auth.listSessions(principal.userId, principal.sessionId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one of the current user sessions' })
  @HttpCode(204)
  async revokeSession(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.revokeSession(principal.userId, id, actorFrom(req));
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(204)
  async changePassword(
    @CurrentStaff() principal: StaffPrincipal,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(principal.userId, principal.sessionId, dto, actorFrom(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    await this.auth.requestPasswordReset(dto.email, actorFrom(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    await this.auth.resetPassword({ token: dto.token, newPassword: dto.newPassword }, actorFrom(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept-invitation')
  @HttpCode(200)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.acceptInvitation(dto, actorFrom(req));
    applyCookies(res, result.session);
    return { user: result.user, tenantId: result.tenantId, csrfToken: result.session.csrfToken };
  }

  @Post('switch-tenant')
  @ApiBearerAuth()
  @HttpCode(200)
  async switchTenant(
    @CurrentStaff() principal: StaffPrincipal,
    @Body() dto: SwitchTenantDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.switchTenant(
      principal.userId,
      dto.tenantId,
      principal.sessionId,
      actorFrom(req),
    );
    applyCookies(res, session);
    return { tenantId: dto.tenantId, csrfToken: session.csrfToken };
  }
}
