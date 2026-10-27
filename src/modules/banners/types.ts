export interface CreateBannerInput {
  title: string;
  subtitle?: string | null;
  badgeText?: string | null;
  ctaLabel?: string | null;
  ctaLink?: string | null;
  desktopImageUrl: string;
  tabletImageUrl?: string | null;
  mobileImageUrl?: string | null;
  desktopImageKey?: string | null;
  tabletImageKey?: string | null;
  mobileImageKey?: string | null;
  altText: string;
  textAlignment?: 'left' | 'center' | 'right';
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateBannerInput {
  title?: string;
  subtitle?: string | null;
  badgeText?: string | null;
  ctaLabel?: string | null;
  ctaLink?: string | null;
  desktopImageUrl?: string;
  tabletImageUrl?: string | null;
  mobileImageUrl?: string | null;
  desktopImageKey?: string | null;
  tabletImageKey?: string | null;
  mobileImageKey?: string | null;
  altText?: string;
  textAlignment?: 'left' | 'center' | 'right';
  isActive?: boolean;
  sortOrder?: number;
}

export interface BannerUploadUrlInput {
  device: 'desktop' | 'tablet' | 'mobile';
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
}
