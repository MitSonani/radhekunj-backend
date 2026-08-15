import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z
    .string({
      required_error: 'Role name is required',
    })
    .trim()
    .min(1, 'Role name cannot be empty')
    .max(100, 'Role name cannot exceed 100 characters'),
});

export const updateRoleSchema = z.object({
  name: z
    .string({
      required_error: 'Role name is required',
    })
    .trim()
    .min(1, 'Role name cannot be empty')
    .max(100, 'Role name cannot exceed 100 characters'),
});

export const roleIdParamSchema = z.object({
  id: z.string().uuid('Invalid role ID format'),
});
