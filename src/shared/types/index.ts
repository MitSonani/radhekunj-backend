import 'express';

export type AuthUser = {
  id: string;
  name: string;
  role: {
    id: string;
    name: string;
  } | null;
};

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    user?: AuthUser;
  }
}

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
};

export type HealthResponse = {
  status: 'ok';
  timestamp: string;
};

export type ReadinessResponse = {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down' | 'not_configured';
  };
};

export type ErrorResponse = {
  success: false;
  message: string;
  requestId?: string;
  details?: unknown;
};
