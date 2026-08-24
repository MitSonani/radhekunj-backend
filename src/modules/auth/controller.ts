import { Request, Response } from 'express';
import * as authService from './service.js';
import { ApiResponse } from '../../shared/types/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

/**
 * Handles generating and sending an OTP.
 */
export async function sendOtpHandler(req: Request, res: Response): Promise<void> {
  const { countryCode, mobileNumber } = req.body as {
    countryCode?: string;
    mobileNumber: string;
  };

  const identifier = `${countryCode || ''}${mobileNumber}`;

  const otp = await authService.sendOtp(identifier, {
    countryCode,
    mobileNumber,
  });

  const response: ApiResponse = {
    success: true,
    message: 'OTP sent successfully',
    ...(otp ? { data: { otp } } : {}),
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Handles verifying an OTP code, performing login or signup.
 */
export async function verifyOtpHandler(req: Request, res: Response): Promise<void> {
  const { countryCode, mobileNumber, otp, name } = req.body as {
    countryCode?: string;
    mobileNumber: string;
    otp: string;
    name?: string;
  };

  const identifier = `${countryCode || ''}${mobileNumber}`;

  const data = await authService.verifyOtp(identifier, otp, {
    name,
    countryCode,
    mobileNumber,
  });

  const response: ApiResponse = {
    success: true,
    data,
    message: 'Authentication successful',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
