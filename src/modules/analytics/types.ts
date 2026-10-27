export interface AnalyticsDashboardQuery {
  range?: 'today' | '7d' | '30d' | '90d' | 'ytd' | 'custom';
  startDate?: string;
  endDate?: string;
}

export interface KpiSummary {
  grossOrderValue: number;
  netCollectedRevenue: number;
  totalRefunds: number;
  totalDiscountAmount: number;
  orderCount: number;
  nonCancelledOrderCount: number;
  cancelledOrderCount: number;
  averageOrderValue: number;
  newCustomers: number;
  pendingPaymentsCount: number;
  awaitingFulfillmentCount: number;
  lowStockVariantsCount: number;
  outOfStockVariantsCount: number;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  revenue: number;
  orderCount: number;
}

export interface PaymentBreakdown {
  byMethod: {
    cod: { count: number; totalAmount: number; collectedAmount: number };
    razorpay: { count: number; totalAmount: number; collectedAmount: number };
  };
  byStatus: Record<string, number>;
}

export interface OrderStatusBreakdown {
  counts: Record<string, number>;
  percentages: Record<string, number>;
}

export interface TopProduct {
  productId: string;
  productName: string;
  sku: string;
  unitsSold: number;
  revenue: number;
}

export interface TopCategory {
  categoryId: string;
  categoryName: string;
  revenue: number;
}

export interface CouponSummary {
  totalDiscounts: number;
  usageCount: number;
  topCoupons: Array<{
    code: string;
    usages: number;
    discountAmount: number;
  }>;
}

export interface LowStockItem {
  variantId: string;
  sku: string;
  productName: string;
  quantity: number;
  reservedQuantity: number;
  availableStock: number;
}

export interface RecentOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  totalAmount: number;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  createdAt: string;
}

export interface DashboardAnalyticsResponse {
  dateRange: {
    preset: string;
    startDate: string;
    endDate: string;
  };
  kpis: KpiSummary;
  timeSeries: TimeSeriesPoint[];
  paymentBreakdown: PaymentBreakdown;
  orderStatusBreakdown: OrderStatusBreakdown;
  topProducts: TopProduct[];
  topCategories: TopCategory[];
  coupons: CouponSummary;
  inventory: {
    lowStockCount: number;
    outOfStockCount: number;
    lowStockItems: LowStockItem[];
  };
  recentOrders: RecentOrderSummary[];
}
