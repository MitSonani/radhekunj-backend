import { Request, Response } from 'express';
import * as roleService from './service.js';
import { ApiResponse } from '../../shared/types/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

/**
 * Creates a new role.
 */
export async function createRoleHandler(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name: string };
  const role = await roleService.createRole(name);

  const response: ApiResponse = {
    success: true,
    data: role,
    message: 'Role created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

/**
 * Retrieves all roles.
 */
export async function getAllRolesHandler(_req: Request, res: Response): Promise<void> {
  const roles = await roleService.getAllRoles();

  const response: ApiResponse = {
    success: true,
    data: roles,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Retrieves a single role by its ID.
 */
export async function getRoleByIdHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const role = await roleService.getRoleById(id);

  const response: ApiResponse = {
    success: true,
    data: role,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Updates an existing role.
 */
export async function updateRoleHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { name } = req.body as { name: string };
  const role = await roleService.updateRole(id, name);

  const response: ApiResponse = {
    success: true,
    data: role,
    message: 'Role updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Deletes a role.
 */
export async function deleteRoleHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await roleService.deleteRole(id);

  const response: ApiResponse = {
    success: true,
    message: 'Role deleted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
