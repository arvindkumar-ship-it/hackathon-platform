import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const start = process.hrtime.bigint();

    const route = request.route?.path ?? request.url;
    const method = request.method;

    return next.handle().pipe(
      tap({
        next: () => this.record(method, route, response.statusCode, start),
        error: () => this.record(method, route, response.statusCode || 500, start),
      }),
    );
  }

  private record(method: string, route: string, statusCode: number, start: bigint) {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = { method, route, status_code: String(statusCode) };
    this.metrics.httpRequestDuration.observe(labels, durationSeconds);
    this.metrics.httpRequestTotal.inc(labels);
  }
}