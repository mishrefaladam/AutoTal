
-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "PurchaseInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'APPOINTMENT', 'OFFER_MADE', 'PURCHASED', 'REJECTED');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "internalNotes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "soldAt" TIMESTAMP(3),
ADD COLUMN     "status" "VehicleStatus" NOT NULL DEFAULT 'IN_STOCK';

-- CreateTable
CREATE TABLE "VehiclePurchaseInquiry" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "firstRegistrationYear" INTEGER NOT NULL,
    "mileageKm" INTEGER NOT NULL,
    "fuel" "FuelType" NOT NULL,
    "transmission" "TransmissionType" NOT NULL,
    "vin" TEXT,
    "priceExpectationCents" INTEGER,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "PurchaseInquiryStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'website',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehiclePurchaseInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehiclePurchaseInquiry_status_createdAt_idx" ON "VehiclePurchaseInquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VehiclePurchaseInquiry_createdAt_idx" ON "VehiclePurchaseInquiry"("createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_status_createdAt_idx" ON "Vehicle"("status", "createdAt");

