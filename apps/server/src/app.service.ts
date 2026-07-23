import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  name: 'cropcorn';
}

@Injectable()
export class AppService {
  getHealth(): HealthStatus {
    return { status: 'ok', name: 'cropcorn' };
  }
}
