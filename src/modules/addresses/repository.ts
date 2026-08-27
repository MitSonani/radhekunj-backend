import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

export type DbClient = Prisma.TransactionClient | typeof prisma;

export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}

const addressSelect = {
  id: true,
  fullName: true,
  countryCode: true,
  mobileNumber: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  label: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;

export type AddressRecord = Prisma.AddressGetPayload<{ select: typeof addressSelect }>;

export type CreateAddressData = {
  userId: string;
  fullName: string;
  countryCode: string;
  mobileNumber: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  label?: string | null;
  isDefault: boolean;
};

export type UpdateAddressData = {
  fullName?: string;
  countryCode?: string;
  mobileNumber?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  label?: string | null;
  isDefault?: boolean;
};

/**
 * Serializes all address mutations for a user, including the first-address
 * create race (FOR UPDATE is a no-op when no rows exist yet).
 */
export async function lockUserAddresses(
  userId: string,
  db: Prisma.TransactionClient,
): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('address:' || ${userId}))`;
}

export async function findAddressByIdForUser(
  addressId: string,
  userId: string,
  db: DbClient = prisma,
): Promise<AddressRecord | null> {
  return db.address.findFirst({
    where: { id: addressId, userId },
    select: addressSelect,
  });
}

export async function findUserAddresses(
  userId: string,
  db: DbClient = prisma,
): Promise<AddressRecord[]> {
  return db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: addressSelect,
  });
}

export async function countUserAddresses(userId: string, db: DbClient = prisma): Promise<number> {
  return db.address.count({ where: { userId } });
}

export async function createAddress(
  data: CreateAddressData,
  db: DbClient = prisma,
): Promise<AddressRecord> {
  return db.address.create({
    data,
    select: addressSelect,
  });
}

export async function updateAddress(
  addressId: string,
  data: UpdateAddressData,
  db: DbClient = prisma,
): Promise<AddressRecord> {
  return db.address.update({
    where: { id: addressId },
    data,
    select: addressSelect,
  });
}

export async function unsetDefaultAddresses(userId: string, db: DbClient = prisma): Promise<void> {
  await db.address.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  });
}

export async function deleteAddress(addressId: string, db: DbClient = prisma): Promise<void> {
  await db.address.delete({ where: { id: addressId } });
}

/**
 * Oldest remaining address for the user (createdAt ASC, id ASC as tiebreaker).
 * Used to promote a new default after the current default is deleted.
 */
export async function findOldestAddressForUser(
  userId: string,
  db: DbClient = prisma,
): Promise<AddressRecord | null> {
  return db.address.findFirst({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: addressSelect,
  });
}
