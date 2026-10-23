import { Router } from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { validateRequest } from "../../shared/utils/validateRequest.js";
import * as publicCategoryController from "./public.controller.js";
import { listPublicCategoriesQuerySchema } from "./validation.js";

const router = Router();

/**
 * GET /api/v1/categories
 * Returns active categories with pagination.
 */
router.get(
  "/",
  validateRequest(listPublicCategoriesQuerySchema, "query"),
  asyncHandler(publicCategoryController.listPublicCategoriesHandler),
);

export default router;
