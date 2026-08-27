import { Prisma } from '@prisma/client';
import { AppError, NotFoundError } from '../../shared/errors/appError.js';
import * as addressRepository from './repository.js';
import type { AddressRecord } from './repository.js';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type AddressResponse = {
  id: string;
  fullName: string;
  countryCode: string;
  mobileNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  label: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Delivery-relevant fields for a future Order snapshot.
 * Orders must copy these values at purchase time; they must not treat the
 * mutable Address row as the permanent delivery address.
 */
export type AddressSnapshot = {
  fullName: string;
  countryCode: string;
  mobileNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type AddressListResponse = {
  items: AddressResponse[];
  count: number;
};

export type CreateAddressInput = {
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
  isDefault?: boolean;
};

export type UpdateAddressInput = {
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

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function toAddressResponse(record: AddressRecord): AddressResponse {
  return {
    id: record.id,
    fullName: record.fullName,
    countryCode: record.countryCode,
    mobileNumber: record.mobileNumber,
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    city: record.city,
    state: record.state,
    postalCode: record.postalCode,
    country: record.country,
    label: record.label,
    isDefault: record.isDefault,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toAddressSnapshot(address: AddressResponse): AddressSnapshot {
  return {
    fullName: address.fullName,
    countryCode: address.countryCode,
    mobileNumber: address.mobileNumber,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

function isUniqueDefaultViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Public service operations
// ---------------------------------------------------------------------------

/**
 * Creates an address for the authenticated user.
 *
 * Default rules:
 * - The user's first address is always default.
 * - Later addresses are non-default unless isDefault is explicitly true.
 * - Setting isDefault true unsets the previous default in the same transaction.
 */
export async function createAddress(
  userId: string,
  input: CreateAddressInput,
): Promise<AddressResponse> {
  try {
    const created = await addressRepository.runTransaction(async (tx) => {
      await addressRepository.lockUserAddresses(userId, tx);

      const existingCount = await addressRepository.countUserAddresses(userId, tx);
      const isDefault = existingCount === 0 ? true : (input.isDefault ?? false);

      if (isDefault && existingCount > 0) {
        await addressRepository.unsetDefaultAddresses(userId, tx);
      }

      return addressRepository.createAddress(
        {
          userId,
          fullName: input.fullName,
          countryCode: input.countryCode,
          mobileNumber: input.mobileNumber,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          country: input.country,
          label: input.label ?? null,
          isDefault,
        },
        tx,
      );
    });

    return toAddressResponse(created);
  } catch (error) {
    if (isUniqueDefaultViolation(error)) {
      throw new AppError(409, 'A default address already exists for this user', {
        context: { userId },
      });
    }

    throw error;
  }
}

/**
 * Returns the authenticated user's addresses.
 * Ordering: default address first, then createdAt DESC.
 */
export async function getAddresses(userId: string): Promise<AddressListResponse> {
  const records = await addressRepository.findUserAddresses(userId);

  return {
    items: records.map(toAddressResponse),
    count: records.length,
  };
}

/**
 * Returns a single address belonging to the authenticated user.
 * Other users' addresses are indistinguishable from missing addresses (404).
 */
export async function getAddressById(userId: string, addressId: string): Promise<AddressResponse> {
  const record = await addressRepository.findAddressByIdForUser(addressId, userId);

  if (!record) {
    throw new NotFoundError('Address not found');
  }

  return toAddressResponse(record);
}

/**
 * Updates an address owned by the authenticated user.
 *
 * isDefault = true unsets the previous default atomically.
 * isDefault = false on the current default is rejected while other addresses
 * exist (or when it is the only address) so the user is never left without a
 * default unless they have zero addresses.
 */
export async function updateAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
): Promise<AddressResponse> {
  try {
    const updated = await addressRepository.runTransaction(async (tx) => {
      await addressRepository.lockUserAddresses(userId, tx);

      const existing = await addressRepository.findAddressByIdForUser(addressId, userId, tx);

      if (!existing) {
        throw new NotFoundError('Address not found');
      }

      if (input.isDefault === false && existing.isDefault) {
        throw new AppError(
          422,
          'Cannot unset the default address. Set another address as default instead.',
          { context: { addressId } },
        );
      }

      if (input.isDefault === true && !existing.isDefault) {
        await addressRepository.unsetDefaultAddresses(userId, tx);
      }

      const { isDefault: _ignored, ...fieldUpdates } = input;

      return addressRepository.updateAddress(
        addressId,
        {
          ...fieldUpdates,
          ...(input.isDefault === true ? { isDefault: true } : {}),
        },
        tx,
      );
    });

    return toAddressResponse(updated);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isUniqueDefaultViolation(error)) {
      throw new AppError(409, 'A default address already exists for this user', {
        context: { userId },
      });
    }

    throw error;
  }
}

/**
 * Marks the given address as the user's sole default address.
 */
export async function setDefaultAddress(
  userId: string,
  addressId: string,
): Promise<AddressResponse> {
  try {
    const updated = await addressRepository.runTransaction(async (tx) => {
      await addressRepository.lockUserAddresses(userId, tx);

      const existing = await addressRepository.findAddressByIdForUser(addressId, userId, tx);

      if (!existing) {
        throw new NotFoundError('Address not found');
      }

      if (existing.isDefault) {
        return existing;
      }

      await addressRepository.unsetDefaultAddresses(userId, tx);

      return addressRepository.updateAddress(addressId, { isDefault: true }, tx);
    });

    return toAddressResponse(updated);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isUniqueDefaultViolation(error)) {
      throw new AppError(409, 'A default address already exists for this user', {
        context: { userId },
      });
    }

    throw error;
  }
}

/**
 * Deletes an address owned by the authenticated user.
 *
 * If the deleted address was default and others remain, the oldest remaining
 * address (createdAt ASC, then id ASC) is promoted to default.
 * Deleting the last address leaves the user with zero addresses.
 */
export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  await addressRepository.runTransaction(async (tx) => {
    await addressRepository.lockUserAddresses(userId, tx);

    const existing = await addressRepository.findAddressByIdForUser(addressId, userId, tx);

    if (!existing) {
      throw new NotFoundError('Address not found');
    }

    await addressRepository.deleteAddress(addressId, tx);

    if (existing.isDefault) {
      const nextDefault = await addressRepository.findOldestAddressForUser(userId, tx);

      if (nextDefault) {
        await addressRepository.updateAddress(nextDefault.id, { isDefault: true }, tx);
      }
    }
  });
}
