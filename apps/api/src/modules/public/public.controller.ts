import { Body, Controller, Get, Param, Post, Req, Res, UseGuards, type RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public, CurrentCustomer } from '../auth/decorators';
import { CustomerAuthGuard } from '../auth/customer-auth.guard';
import { setCsrfCookie, setCustomerCookie } from '../auth/cookies';
import { actorFrom, idempotencyKeyFrom } from '../../common/actor';
import type { CustomerPrincipal } from '../auth/principal';
import { PublicService } from './public.service';
import {
  CustomerCancelOrderDto,
  CustomerRequestDto,
  CreateCustomerSessionDto,
  ProviderWebhookDto,
} from './public.dto';
import { CreateOrderDto } from '../orders/orders.dto';
import { randomBytes } from 'node:crypto';

@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('qr/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  qrLanding(@Param('token') token: string) {
    return this.publicService.qrLanding(token);
  }

  @Post('qr/:token/session')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createSession(
    @Param('token') token: string,
    @Body() dto: CreateCustomerSessionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.publicService.createCustomerSession(token, dto, actorFrom(req));
    setCustomerCookie(res, result.token, result.expiresAt);

    let csrfToken = req.cookies?.tt_csrf as string | undefined;
    if (!csrfToken) {
      csrfToken = randomBytes(32).toString('hex');
      setCsrfCookie(res, csrfToken, result.expiresAt);
    }

    return { ...result, csrfToken };
  }

  @Get('customer-session')
  @UseGuards(CustomerAuthGuard)
  session(@CurrentCustomer() principal: CustomerPrincipal) {
    return this.publicService.getSessionState(principal);
  }

  @Get('customer-session/menu')
  @UseGuards(CustomerAuthGuard)
  menu(@CurrentCustomer() principal: CustomerPrincipal) {
    return this.publicService.menuForSession(principal);
  }

  @Post('customer-session/orders')
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createOrder(
    @CurrentCustomer() principal: CustomerPrincipal,
    @Body() dto: CreateOrderDto,
    @Req() req: Request,
  ) {
    return this.publicService.createOrder(principal, dto, idempotencyKeyFrom(req), actorFrom(req));
  }

  @Post('customer-session/orders/:id/cancel')
  @UseGuards(CustomerAuthGuard)
  cancelOrder(
    @CurrentCustomer() principal: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: CustomerCancelOrderDto,
    @Req() req: Request,
  ) {
    return this.publicService.cancelOrder(principal, id, dto.reason, actorFrom(req));
  }

  @Get('customer-session/requests')
  @UseGuards(CustomerAuthGuard)
  requests(@CurrentCustomer() principal: CustomerPrincipal) {
    return this.publicService.listRequests(principal);
  }

  @Post('customer-session/requests')
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createRequest(
    @CurrentCustomer() principal: CustomerPrincipal,
    @Body() dto: CustomerRequestDto,
    @Req() req: Request,
  ) {
    return this.publicService.createRequest(principal, dto, actorFrom(req));
  }

  /**
   * Server-to-server payment webhook. Authenticated by an HMAC signature, not a
   * cookie; the raw body is required so the signature covers the exact bytes.
   */
  @Post('payments/provider/:provider/webhook')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  providerWebhook(
    @Param('provider') provider: string,
    @Body() dto: ProviderWebhookDto,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.publicService.handleProviderWebhook(
      provider,
      dto,
      req.rawBody,
      req.headers['x-provider-signature'],
    );
  }
}
