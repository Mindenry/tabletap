import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * SMTP mail. In development this points at Mailpit (http://localhost:8125).
 * Delivery failure is logged and swallowed: email is never allowed to break a
 * restaurant workflow.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  private getTransport(): Transporter {
    if (!this.transporter) {
      const host = process.env.SMTP_HOST ?? 'localhost';
      const port = Number(process.env.SMTP_PORT ?? 1125);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: false,
        ignoreTLS: true,
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<boolean> {
    try {
      await this.getTransport().sendMail({
        from: process.env.MAIL_FROM ?? 'TableTap <no-reply@tabletap.local>',
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : error, to: message.to },
        'Email delivery failed (non-blocking)',
      );
      return false;
    }
  }

  async sendInvitation(input: {
    to: string;
    tenantName: string;
    roleName: string;
    token: string;
  }): Promise<boolean> {
    const link = `${env.webUrl}/accept-invitation?token=${encodeURIComponent(input.token)}`;
    return this.send({
      to: input.to,
      subject: `You are invited to ${input.tenantName} on TableTap`,
      text: `You have been invited to join ${input.tenantName} as ${input.roleName}.\n\nAccept: ${link}\n\nThis link expires in 7 days.`,
    });
  }

  async sendPasswordReset(input: { to: string; token: string }): Promise<boolean> {
    const link = `${env.webUrl}/reset-password?token=${encodeURIComponent(input.token)}`;
    return this.send({
      to: input.to,
      subject: 'Reset your TableTap password',
      text: `Reset your password: ${link}\n\nThis link expires in 60 minutes. If you did not request it, ignore this email.`,
    });
  }
}

@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
