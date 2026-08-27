import { z } from 'zod';
import { ADDRESS } from '../../shared/constants/index.js';

const fullNameSchema = z
  .string({ required_error: 'fullName is required' })
  .trim()
  .min(1, 'fullName cannot be empty')
  .max(ADDRESS.FULL_NAME_MAX, `fullName cannot exceed ${ADDRESS.FULL_NAME_MAX} characters`);

const countryCodeSchema = z
  .string({ required_error: 'countryCode is required' })
  .trim()
  .min(1, 'countryCode cannot be empty')
  .max(ADDRESS.COUNTRY_CODE_MAX, `countryCode cannot exceed ${ADDRESS.COUNTRY_CODE_MAX} characters`)
  .regex(ADDRESS.COUNTRY_CODE_PATTERN, 'countryCode must be in the format +XX');

const mobileNumberSchema = z
  .string({ required_error: 'mobileNumber is required' })
  .trim()
  .min(
    ADDRESS.MOBILE_NUMBER_MIN,
    `mobileNumber must be at least ${ADDRESS.MOBILE_NUMBER_MIN} digits`,
  )
  .max(ADDRESS.MOBILE_NUMBER_MAX, `mobileNumber cannot exceed ${ADDRESS.MOBILE_NUMBER_MAX} digits`)
  .regex(ADDRESS.MOBILE_NUMBER_PATTERN, 'mobileNumber must contain digits only');

const addressLine1Schema = z
  .string({ required_error: 'addressLine1 is required' })
  .trim()
  .min(1, 'addressLine1 cannot be empty')
  .max(ADDRESS.LINE_MAX, `addressLine1 cannot exceed ${ADDRESS.LINE_MAX} characters`);

const addressLine2Schema = z
  .string()
  .trim()
  .max(ADDRESS.LINE_MAX, `addressLine2 cannot exceed ${ADDRESS.LINE_MAX} characters`)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const citySchema = z
  .string({ required_error: 'city is required' })
  .trim()
  .min(1, 'city cannot be empty')
  .max(ADDRESS.CITY_MAX, `city cannot exceed ${ADDRESS.CITY_MAX} characters`);

const stateSchema = z
  .string({ required_error: 'state is required' })
  .trim()
  .min(1, 'state cannot be empty')
  .max(ADDRESS.STATE_MAX, `state cannot exceed ${ADDRESS.STATE_MAX} characters`);

const postalCodeSchema = z
  .string({ required_error: 'postalCode is required' })
  .trim()
  .min(ADDRESS.POSTAL_CODE_MIN, `postalCode must be at least ${ADDRESS.POSTAL_CODE_MIN} characters`)
  .max(ADDRESS.POSTAL_CODE_MAX, `postalCode cannot exceed ${ADDRESS.POSTAL_CODE_MAX} characters`)
  .regex(
    ADDRESS.POSTAL_CODE_PATTERN,
    'postalCode may contain letters, digits, spaces, and hyphens',
  );

const countrySchema = z
  .string({ required_error: 'country is required' })
  .trim()
  .min(1, 'country cannot be empty')
  .max(ADDRESS.COUNTRY_MAX, `country cannot exceed ${ADDRESS.COUNTRY_MAX} characters`);

const labelSchema = z
  .string()
  .trim()
  .max(ADDRESS.LABEL_MAX, `label cannot exceed ${ADDRESS.LABEL_MAX} characters`)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

export const createAddressSchema = z.object({
  fullName: fullNameSchema,
  countryCode: countryCodeSchema,
  mobileNumber: mobileNumberSchema,
  addressLine1: addressLine1Schema,
  addressLine2: addressLine2Schema,
  city: citySchema,
  state: stateSchema,
  postalCode: postalCodeSchema,
  country: countrySchema,
  label: labelSchema,
  isDefault: z.boolean({ invalid_type_error: 'isDefault must be a boolean' }).optional(),
});

export const updateAddressSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    countryCode: countryCodeSchema.optional(),
    mobileNumber: mobileNumberSchema.optional(),
    addressLine1: addressLine1Schema.optional(),
    addressLine2: addressLine2Schema,
    city: citySchema.optional(),
    state: stateSchema.optional(),
    postalCode: postalCodeSchema.optional(),
    country: countrySchema.optional(),
    label: labelSchema,
    isDefault: z.boolean({ invalid_type_error: 'isDefault must be a boolean' }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const addressIdParamSchema = z.object({
  id: z.string().uuid('Invalid address ID format'),
});
