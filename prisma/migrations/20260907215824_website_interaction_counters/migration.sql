-- CreateEnum
CREATE TYPE "InteractionChannel" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'WILLHABEN', 'AUTOSCOUT', 'GEBRAUCHTWAGEN', 'INSTAGRAM');

-- CreateTable
CREATE TABLE "InteractionCounter" (
    "channel" "InteractionChannel" NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InteractionCounter_pkey" PRIMARY KEY ("channel","day")
);

-- CreateIndex
CREATE INDEX "InteractionCounter_day_idx" ON "InteractionCounter"("day");
