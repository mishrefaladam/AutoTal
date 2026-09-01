-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'PLUGIN_HYBRID', 'ELECTRIC', 'LPG', 'CNG', 'HYDROGEN', 'OTHER');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL', 'AUTOMATIC', 'SEMI_AUTOMATIC');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('SMALL_CAR', 'SEDAN', 'ESTATE', 'SUV', 'COUPE', 'CONVERTIBLE', 'VAN', 'TRANSPORTER', 'PICKUP', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleCondition" AS ENUM ('NEW', 'USED', 'DEMO', 'ANNUAL_CAR');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SocialDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "externalSource" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT,
    "priceCents" INTEGER NOT NULL,
    "vatDeductible" BOOLEAN NOT NULL DEFAULT false,
    "mileageKm" INTEGER NOT NULL,
    "firstRegistration" TIMESTAMP(3),
    "fuel" "FuelType" NOT NULL,
    "transmission" "TransmissionType" NOT NULL,
    "bodyType" "BodyType" NOT NULL DEFAULT 'OTHER',
    "condition" "VehicleCondition" NOT NULL DEFAULT 'USED',
    "powerKw" INTEGER,
    "displacementCcm" INTEGER,
    "color" TEXT,
    "doors" INTEGER,
    "seats" INTEGER,
    "previousOwners" INTEGER,
    "inspectionValidUntil" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleImage" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "externalId" TEXT,

    CONSTRAINT "VehicleImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "vehiclesFound" INTEGER NOT NULL DEFAULT 0,
    "vehiclesCreated" INTEGER NOT NULL DEFAULT 0,
    "vehiclesUpdated" INTEGER NOT NULL DEFAULT 0,
    "vehiclesDeactivated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tagline" TEXT,
    "aboutText" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Österreich',
    "phone" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "email" TEXT NOT NULL,
    "vatId" TEXT,
    "commercialRegisterNumber" TEXT,
    "commercialRegisterCourt" TEXT,
    "contactPersonName" TEXT,
    "contactPersonRole" TEXT,
    "contactPersonEmail" TEXT,
    "contactPersonPhone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultInterestRateBp" INTEGER NOT NULL DEFAULT 599,
    "minInterestRateBp" INTEGER NOT NULL DEFAULT 0,
    "maxInterestRateBp" INTEGER NOT NULL DEFAULT 1500,
    "minTermMonths" INTEGER NOT NULL DEFAULT 12,
    "maxTermMonths" INTEGER NOT NULL DEFAULT 96,
    "defaultTermMonths" INTEGER NOT NULL DEFAULT 60,
    "minDownPaymentBp" INTEGER NOT NULL DEFAULT 0,
    "maxDownPaymentBp" INTEGER NOT NULL DEFAULT 8000,
    "defaultDownPaymentBp" INTEGER NOT NULL DEFAULT 2000,
    "minBalloonBp" INTEGER NOT NULL DEFAULT 0,
    "maxBalloonBp" INTEGER NOT NULL DEFAULT 5000,
    "defaultBalloonBp" INTEGER NOT NULL DEFAULT 0,
    "disclaimer" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "interestRateBp" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialDraft" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL DEFAULT 'INSTAGRAM',
    "status" "SocialDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedByModel" TEXT,
    "generatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByUser" TEXT,
    "publishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "externalPermalink" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "externalUsername" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_slug_key" ON "Vehicle"("slug");

-- CreateIndex
CREATE INDEX "Vehicle_active_priceCents_idx" ON "Vehicle"("active", "priceCents");

-- CreateIndex
CREATE INDEX "Vehicle_active_createdAt_idx" ON "Vehicle"("active", "createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_active_make_model_idx" ON "Vehicle"("active", "make", "model");

-- CreateIndex
CREATE INDEX "Vehicle_active_fuel_idx" ON "Vehicle"("active", "fuel");

-- CreateIndex
CREATE INDEX "Vehicle_active_transmission_idx" ON "Vehicle"("active", "transmission");

-- CreateIndex
CREATE INDEX "Vehicle_active_mileageKm_idx" ON "Vehicle"("active", "mileageKm");

-- CreateIndex
CREATE INDEX "Vehicle_active_firstRegistration_idx" ON "Vehicle"("active", "firstRegistration");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_externalSource_externalId_key" ON "Vehicle"("externalSource", "externalId");

-- CreateIndex
CREATE INDEX "VehicleImage_vehicleId_position_idx" ON "VehicleImage"("vehicleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleImage_vehicleId_url_key" ON "VehicleImage"("vehicleId", "url");

-- CreateIndex
CREATE INDEX "SyncRun_source_startedAt_idx" ON "SyncRun"("source", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "OpeningHour_companyId_weekday_position_idx" ON "OpeningHour"("companyId", "weekday", "position");

-- CreateIndex
CREATE INDEX "SocialLink_companyId_position_idx" ON "SocialLink"("companyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SocialLink_companyId_platform_key" ON "SocialLink"("companyId", "platform");

-- CreateIndex
CREATE INDEX "FinanceProvider_active_position_idx" ON "FinanceProvider"("active", "position");

-- CreateIndex
CREATE INDEX "SocialDraft_status_createdAt_idx" ON "SocialDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SocialDraft_vehicleId_idx" ON "SocialDraft"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_provider_key" ON "IntegrationCredential"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");

-- AddForeignKey
ALTER TABLE "VehicleImage" ADD CONSTRAINT "VehicleImage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDraft" ADD CONSTRAINT "SocialDraft_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
