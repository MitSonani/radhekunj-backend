import { Request, Response } from "express";
import { HTTP_STATUS } from "../../shared/constants/index.js";
import type { ApiResponse } from "../../shared/types/index.js";
import * as orderService from "./service.js";
import type {
  AdminListOrdersFilters,
  CreateShipmentInput,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from "./types.js";

export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  const page = typeof req.query["page"] === "string" ? parseInt(req.query["page"], 10) : 1;
  const limit = typeof req.query["limit"] === "string" ? parseInt(req.query["limit"], 10) : 20;

  const filters: AdminListOrdersFilters = {
    search: typeof req.query["search"] === "string" ? req.query["search"] : undefined,
    status: req.query["status"] as OrderStatus | undefined,
    paymentMethod: req.query["paymentMethod"] as PaymentMethod | undefined,
    paymentStatus: req.query["paymentStatus"] as PaymentStatus | undefined,
    shipmentStatus: req.query["shipmentStatus"] as ShipmentStatus | undefined,
    startDate: req.query["startDate"] ? new Date(req.query["startDate"] as string) : undefined,
    endDate: req.query["endDate"] ? new Date(req.query["endDate"] as string) : undefined,
  };

  const result = await orderService.getAdminOrders(filters, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result.items,
    pagination: result.pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getOrderByIdHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const order = await orderService.getAdminOrderById(id);

  const response: ApiResponse = {
    success: true,
    data: order,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateOrderStatusHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const { status } = req.body as { status: OrderStatus };

  const updatedOrder = await orderService.updateOrderStatus(id, status);

  const response: ApiResponse = {
    success: true,
    data: updatedOrder,
    message: "Order status updated successfully",
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function createShipmentHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const payload = req.body as CreateShipmentInput;

  const updatedOrder = await orderService.createOrderShipment(id, payload);

  const response: ApiResponse = {
    success: true,
    data: updatedOrder,
    message: "Shipment created successfully",
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function updateShipmentStatusHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const shipmentId = req.params["shipmentId"] as string;
  const { status } = req.body as { status: ShipmentStatus };

  const updatedOrder = await orderService.updateShipmentStatus(id, shipmentId, status);

  const response: ApiResponse = {
    success: true,
    data: updatedOrder,
    message: "Shipment status updated successfully",
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updatePaymentStatusHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const paymentId = req.params["paymentId"] as string;
  const { paymentStatus } = req.body as { paymentStatus: PaymentStatus };

  const updatedOrder = await orderService.updateOrderPaymentStatus(id, paymentId, paymentStatus);

  const response: ApiResponse = {
    success: true,
    data: updatedOrder,
    message: "Payment status updated successfully",
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function retryRefundHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const refundId = req.params["refundId"] as string;

  const { retryRefund } = await import("../payments/refundService.js");
  const refund = await retryRefund(id, refundId);

  const response: ApiResponse = {
    success: true,
    data: refund,
    message: "Refund retry initiated successfully",
  };

  res.status(HTTP_STATUS.OK).json(response);
}
