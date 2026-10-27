import { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import * as analyticsService from './service.js';
import type { AnalyticsDashboardQuery } from './types.js';

export async function getDashboardAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const query: AnalyticsDashboardQuery = {
    range: typeof req.query['range'] === 'string' ? (req.query['range'] as AnalyticsDashboardQuery['range']) : undefined,
    startDate: typeof req.query['startDate'] === 'string' ? req.query['startDate'] : undefined,
    endDate: typeof req.query['endDate'] === 'string' ? req.query['endDate'] : undefined,
  };

  const data = await analyticsService.getDashboardAnalytics(query);

  const response: ApiResponse = {
    success: true,
    data,
  };

  res.status(HTTP_STATUS.OK).json(response);
}
