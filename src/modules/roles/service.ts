import { prisma } from '../../database/prisma.js';
import { AppError, NotFoundError } from '../../shared/errors/appError.js';

/**
 * Creates a new role.
 * @param name The name of the role.
 * @returns The created role object.
 * @throws AppError if the role name already exists.
 */
export async function createRole(name: string) {
  const existingRole = await prisma.role.findUnique({
    where: { name },
    select: { id: true },
  });

  if (existingRole) {
    throw new AppError(409, `Role name "${name}" already exists`);
  }

  return prisma.role.create({
    data: { name },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Retrieves all roles.
 * @returns An array of role objects.
 */
export async function getAllRoles() {
  return prisma.role.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Retrieves a role by its ID.
 * @param id The role ID.
 * @returns The role object.
 * @throws NotFoundError if the role does not exist.
 */
export async function getRoleById(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!role) {
    throw new NotFoundError(`Role with ID "${id}" not found`);
  }

  return role;
}

/**
 * Updates an existing role's name.
 * @param id The role ID.
 * @param name The new name of the role.
 * @returns The updated role object.
 * @throws NotFoundError if the role does not exist.
 * @throws AppError if the new name is already taken by another role.
 */
export async function updateRole(id: string, name: string) {
  // Ensure the role exists
  await getRoleById(id);

  // Check if another role is already using this name
  const duplicateRole = await prisma.role.findFirst({
    where: {
      name,
      id: { not: id },
    },
    select: { id: true },
  });

  if (duplicateRole) {
    throw new AppError(409, `Role name "${name}" already exists`);
  }

  return prisma.role.update({
    where: { id },
    data: { name },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Deletes a role by ID.
 * @param id The role ID.
 * @returns The deleted role object.
 * @throws NotFoundError if the role does not exist.
 * @throws AppError if the role is currently assigned to one or more users.
 */
export async function deleteRole(id: string) {
  // Ensure the role exists
  await getRoleById(id);

  // Check if any users are assigned to this role
  const userCount = await prisma.user.count({
    where: { roleId: id },
  });

  if (userCount > 0) {
    throw new AppError(400, `Cannot delete role because it is assigned to ${userCount} user(s)`);
  }

  return prisma.role.delete({
    where: { id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
