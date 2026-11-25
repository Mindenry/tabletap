import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [OutboxService, OutboxDispatcher, RealtimeGateway],
  exports: [OutboxService, RealtimeGateway],
})
export class RealtimeModule {}
