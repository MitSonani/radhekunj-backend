import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ALL", "ACTIVE", "DISABLED"]).default("ALL"),
  sortBy: z.enum(["createdAt", "name", "totalOrders", "totalSpending"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const customerIdParamSchema = z.object({
  id: z.string().uuid("Invalid customer ID"),
});

export const updateCustomerStatusSchema = z.object({
  isActive: z.boolean({
    required_error: "isActive is required",
    invalid_type_error: "isActive must be a boolean",
  }),
});

