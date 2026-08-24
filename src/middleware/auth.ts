import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config/index.js';
import { prisma } from '../database/prisma.js';
import { AppError } from '../shared/errors/appError.js';

interface DecodedToken {
  id: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware to verify JWT from the Authorization header and attach user to Request.
 */
export async function authenticateJWT(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError(401, 'Access token is missing or invalid'));
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    next(new AppError(401, 'Access token is missing or invalid'));
    return;
  }

  try {
    const secret = appConfig.jwtSecret || '';
    const decoded = jwt.verify(token, secret) as unknown as DecodedToken;

    // Fetch user and role from database to verify active user status
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      next(new AppError(401, 'User not found or session invalid'));
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(new AppError(401, 'Access token is invalid or expired', { cause: error }));
  }
}

/**
 * Middleware factory to authorize access based on user roles.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required'));
      return;
    }

    const userRole = req.user.role?.name;

    if (!userRole || !allowedRoles.includes(userRole)) {
      next(new AppError(403, 'Forbidden: You do not have permission to access this resource'));
      return;
    }

    next();
  };
}
