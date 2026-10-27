-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "subtitle" VARCHAR(500),
    "badge_text" VARCHAR(100),
    "cta_label" VARCHAR(100),
    "cta_link" VARCHAR(500),
    "desktop_image_url" VARCHAR(1000) NOT NULL,
    "tablet_image_url" VARCHAR(1000),
    "mobile_image_url" VARCHAR(1000),
    "desktop_image_key" VARCHAR(500),
    "tablet_image_key" VARCHAR(500),
    "mobile_image_key" VARCHAR(500),
    "alt_text" VARCHAR(255) NOT NULL,
    "text_alignment" VARCHAR(20) NOT NULL DEFAULT 'left',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_is_active_sort_order_idx" ON "banners"("is_active", "sort_order");
