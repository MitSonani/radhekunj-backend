import { OrderStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../shared/errors/appError.js';
import type {
  AnalyticsDashboardQuery,
  DashboardAnalyticsResponse,
  KpiSummary,
  TimeSeriesPoint,
  PaymentBreakdown,
  TopProduct,
  TopCategory,
  LowStockItem,
  RecentOrderSummary,
} from './types.js';

function startOfDay(d: Date): Date {
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  return res;
}

function endOfDay(d: Date): Date {
  const res = new Date(d);
  res.setHours(23, 59, 59, 999);
  return res;
}

function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveDateRange(query: AnalyticsDashboardQuery): {
  preset: string;
  startDate: Date;
  endDate: Date;
} {
  const now = new Date();
  const preset = query.range || '7d';

  if (preset === 'today') {
    return {
      preset,
      startDate: startOfDay(now),
      endDate: endOfDay(now),
    };
  }

  if (preset === '7d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return {
      preset,
      startDate: startOfDay(start),
      endDate: endOfDay(now),
    };
  }

  if (preset === '30d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    return {
      preset,
      startDate: startOfDay(start),
      endDate: endOfDay(now),
    };
  }

  if (preset === '90d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 89);
    return {
      preset,
      startDate: startOfDay(start),
      endDate: endOfDay(now),
    };
  }

  if (preset === 'ytd') {
    const start = new Date(now.getFullYear(), 0, 1);
    return {
      preset,
      startDate: startOfDay(start),
      endDate: endOfDay(now),
    };
  }

  if (preset === 'custom') {
    if (!query.startDate || !query.endDate) {
      throw new AppError(400, 'Both startDate and endDate are required for custom date range');
    }
    const start = new Date(query.startDate);
    const end = new Date(query.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new AppError(400, 'Invalid startDate or endDate format (expected ISO date string)');
    }
    if (start > end) {
      throw new AppError(400, 'startDate cannot be later than endDate');
    }
    return {
      preset,
      startDate: startOfDay(start),
      endDate: endOfDay(end),
    };
  }

  // Default to 7d
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  return {
    preset: '7d',
    startDate: startOfDay(start),
    endDate: endOfDay(now),
  };
}

export async function getDashboardAnalytics(
  query: AnalyticsDashboardQuery,
): Promise<DashboardAnalyticsResponse> {
  const { preset, startDate, endDate } = resolveDateRange(query);

  // Parallel database reads for all metrics
  const [
    ordersInRange,
    refundsInRange,
    customerRole,
    pendingPaymentsCount,
    awaitingFulfillmentCount,
    lowStockInventory,
    outOfStockCount,
    couponUsagesInRange,
    recentOrderRecords,
  ] = await Promise.all([
    // 1. Orders created in range with items and payments
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: true,
        payments: true,
      },
    }),

    // 2. Processed refunds in range
    prisma.refund.findMany({
      where: {
        status: 'PROCESSED',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
      },
    }),

    // 3. Customer role ID for counting new customers
    prisma.role.findFirst({
      where: { name: { in: ['customer', 'CUSTOMER'] } },
      select: { id: true },
    }),

    // 5. Real-time count of orders pending payment
    prisma.order.count({
      where: { status: OrderStatus.PENDING_PAYMENT },
    }),

    // 6. Real-time count of orders confirmed and awaiting shipment
    prisma.order.count({
      where: { status: OrderStatus.CONFIRMED },
    }),

    // 7. Real-time low-stock variants (quantity <= 5 and quantity > 0)
    prisma.inventory.findMany({
      where: {
        quantity: { lte: 5, gt: 0 },
      },
      include: {
        variant: {
          include: {
            product: { select: { name: true, categoryId: true } },
          },
        },
      },
      take: 10,
    }),

    // 8. Real-time out of stock count (quantity <= 0)
    prisma.inventory.count({
      where: {
        quantity: { lte: 0 },
      },
    }),

    // 9. Coupon usages in range
    prisma.couponUsage.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        coupon: { select: { code: true } },
      },
    }),

    // 10. Most recent 8 orders across the store
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        user: { select: { name: true, mobileNumber: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
  ]);

  // Count new customers accurately using role ID
  const newCustomers = customerRole
    ? await prisma.user.count({
        where: {
          roleId: customerRole.id,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      })
    : 0;

  // ---------------------------------------------------------------------------
  // KPI Aggregations
  // ---------------------------------------------------------------------------
  let grossOrderValue = 0;
  let totalDiscountAmount = 0;
  let nonCancelledOrderCount = 0;
  let cancelledOrderCount = 0;
  let collectedPaymentsSum = 0;

  const paymentBreakdown: PaymentBreakdown = {
    byMethod: {
      cod: { count: 0, totalAmount: 0, collectedAmount: 0 },
      razorpay: { count: 0, totalAmount: 0, collectedAmount: 0 },
    },
    byStatus: {
      PAID: 0,
      PENDING: 0,
      FAILED: 0,
      CANCELLED: 0,
      REFUNDED: 0,
    },
  };

  const orderStatusCounts: Record<string, number> = {
    CONFIRMED: 0,
    PENDING_PAYMENT: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };

  // Group items by product for top products
  const productAggMap = new Map<string, { productId: string; productName: string; sku: string; unitsSold: number; revenue: number }>();

  // Daily map for time series
  const dailyTimeSeriesMap = new Map<string, { revenue: number; orderCount: number }>();

  // Initialise daily time-series buckets from startDate to endDate
  const curDay = new Date(startDate);
  while (curDay <= endDate) {
    dailyTimeSeriesMap.set(formatDateKey(curDay), { revenue: 0, orderCount: 0 });
    curDay.setDate(curDay.getDate() + 1);
  }

  for (const order of ordersInRange) {
    const total = Number(order.totalAmount);
    const discount = Number(order.discountAmount);
    const status = order.status;
    const isCancelled = status === OrderStatus.CANCELLED;

    // Order status counts
    orderStatusCounts[status] = (orderStatusCounts[status] || 0) + 1;

    if (isCancelled) {
      cancelledOrderCount++;
    } else {
      nonCancelledOrderCount++;
      grossOrderValue += total;
      totalDiscountAmount += discount;

      // Add to daily time series
      const dateKey = formatDateKey(order.createdAt);
      const dayBucket = dailyTimeSeriesMap.get(dateKey);
      if (dayBucket) {
        dayBucket.revenue += total;
        dayBucket.orderCount += 1;
      }

      // Add items to product aggregations
      for (const item of order.items) {
        const itemRev = Number(item.lineTotal);
        const existing = productAggMap.get(item.productId);
        if (existing) {
          existing.unitsSold += item.quantity;
          existing.revenue += itemRev;
        } else {
          productAggMap.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            unitsSold: item.quantity,
            revenue: itemRev,
          });
        }
      }
    }

    // Payment method breakdown
    for (const payment of order.payments) {
      const pAmt = Number(payment.amount);
      const pStatus = payment.paymentStatus;

      paymentBreakdown.byStatus[pStatus] = (paymentBreakdown.byStatus[pStatus] || 0) + 1;

      if (payment.paymentMethod === PaymentMethod.COD) {
        paymentBreakdown.byMethod.cod.count++;
        paymentBreakdown.byMethod.cod.totalAmount += pAmt;
        if (pStatus === PaymentStatus.PAID) {
          paymentBreakdown.byMethod.cod.collectedAmount += pAmt;
          collectedPaymentsSum += pAmt;
        }
      } else if (payment.paymentMethod === PaymentMethod.RAZORPAY) {
        paymentBreakdown.byMethod.razorpay.count++;
        paymentBreakdown.byMethod.razorpay.totalAmount += pAmt;
        if (pStatus === PaymentStatus.PAID) {
          paymentBreakdown.byMethod.razorpay.collectedAmount += pAmt;
          collectedPaymentsSum += pAmt;
        }
      }
    }
  }

  // Refunds sum
  let totalRefunds = 0;
  for (const r of refundsInRange) {
    totalRefunds += Number(r.amount);
  }

  // Net collected revenue = sum of collected/paid payments minus processed refunds
  const netCollectedRevenue = Math.max(0, collectedPaymentsSum - totalRefunds);

  // Average order value (gross non-cancelled orders / count)
  const averageOrderValue = nonCancelledOrderCount > 0 ? grossOrderValue / nonCancelledOrderCount : 0;

  // Format time series list
  const timeSeries: TimeSeriesPoint[] = Array.from(dailyTimeSeriesMap.entries()).map(([date, val]) => ({
    date,
    revenue: Math.round(val.revenue * 100) / 100,
    orderCount: val.orderCount,
  }));

  // Order status percentages
  const totalOrders = ordersInRange.length;
  const orderStatusPercentages: Record<string, number> = {};
  for (const [s, count] of Object.entries(orderStatusCounts)) {
    orderStatusPercentages[s] = totalOrders > 0 ? Math.round((count / totalOrders) * 1000) / 10 : 0;
  }

  // Top products (top 5 by revenue)
  const topProducts: TopProduct[] = Array.from(productAggMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      ...p,
      revenue: Math.round(p.revenue * 100) / 100,
    }));

  // Top categories based on top product sales
  const productIds = topProducts.map((p) => p.productId);
  const productsWithCat = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      category: { select: { id: true, name: true } },
    },
  });

  const categoryRevenueMap = new Map<string, { categoryId: string; categoryName: string; revenue: number }>();
  for (const p of topProducts) {
    const pWithCat = productsWithCat.find((x) => x.id === p.productId);
    if (pWithCat?.category) {
      const cat = pWithCat.category;
      const existing = categoryRevenueMap.get(cat.id);
      if (existing) {
        existing.revenue += p.revenue;
      } else {
        categoryRevenueMap.set(cat.id, {
          categoryId: cat.id,
          categoryName: cat.name,
          revenue: p.revenue,
        });
      }
    }
  }

  const topCategories: TopCategory[] = Array.from(categoryRevenueMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      revenue: Math.round(c.revenue * 100) / 100,
    }));

  // Coupon summary
  let totalDiscounts = 0;
  const couponStatsMap = new Map<string, { code: string; usages: number; discountAmount: number }>();

  for (const usage of couponUsagesInRange) {
    const disc = Number(usage.discountAmount);
    totalDiscounts += disc;
    const code = usage.coupon.code;
    const existing = couponStatsMap.get(code);
    if (existing) {
      existing.usages += 1;
      existing.discountAmount += disc;
    } else {
      couponStatsMap.set(code, {
        code,
        usages: 1,
        discountAmount: disc,
      });
    }
  }

  const topCoupons = Array.from(couponStatsMap.values())
    .sort((a, b) => b.discountAmount - a.discountAmount)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      discountAmount: Math.round(c.discountAmount * 100) / 100,
    }));

  // Low stock inventory items
  const lowStockItems: LowStockItem[] = lowStockInventory.map((inv) => ({
    variantId: inv.variantId,
    sku: inv.variant.sku,
    productName: inv.variant.product.name,
    quantity: inv.quantity,
    reservedQuantity: inv.reservedQuantity,
    availableStock: inv.quantity - inv.reservedQuantity,
  }));

  // Recent orders formatted
  const recentOrders: RecentOrderSummary[] = recentOrderRecords.map((o) => {
    const primaryPayment = o.payments[0];
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.user.name || 'Anonymous',
      customerMobile: o.user.mobileNumber,
      totalAmount: Math.round(Number(o.totalAmount) * 100) / 100,
      status: o.status,
      paymentMethod: primaryPayment?.paymentMethod || null,
      paymentStatus: primaryPayment?.paymentStatus || null,
      createdAt: o.createdAt.toISOString(),
    };
  });

  const kpis: KpiSummary = {
    grossOrderValue: Math.round(grossOrderValue * 100) / 100,
    netCollectedRevenue: Math.round(netCollectedRevenue * 100) / 100,
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    totalDiscountAmount: Math.round(totalDiscountAmount * 100) / 100,
    orderCount: ordersInRange.length,
    nonCancelledOrderCount,
    cancelledOrderCount,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    newCustomers,
    pendingPaymentsCount,
    awaitingFulfillmentCount,
    lowStockVariantsCount: lowStockInventory.length,
    outOfStockVariantsCount: outOfStockCount,
  };

  return {
    dateRange: {
      preset,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    kpis,
    timeSeries,
    paymentBreakdown,
    orderStatusBreakdown: {
      counts: orderStatusCounts,
      percentages: orderStatusPercentages,
    },
    topProducts,
    topCategories,
    coupons: {
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      usageCount: couponUsagesInRange.length,
      topCoupons,
    },
    inventory: {
      lowStockCount: lowStockInventory.length,
      outOfStockCount,
      lowStockItems,
    },
    recentOrders,
  };
}
