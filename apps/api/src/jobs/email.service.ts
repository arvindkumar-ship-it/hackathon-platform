import { Injectable } from '@nestjs/common';
import { SmtpEmailProvider } from './smtp-email.provider';
import { SendEmailInput } from './email-provider';

@Injectable()
export class EmailService {
  constructor(private readonly smtpProvider: SmtpEmailProvider) {}

  send(input: SendEmailInput) {
    return this.smtpProvider.send(input);
  }
}