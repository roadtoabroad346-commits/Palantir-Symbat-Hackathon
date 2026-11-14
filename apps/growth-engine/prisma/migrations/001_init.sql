CREATE TABLE "Campaign" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT "draft",
  "budgetUsd" REAL NOT NULL DEFAULT 0,
  "minAge" INTEGER NOT NULL DEFAULT 18,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MessageVariant" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaignId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "label" TEXT NOT NULL
);
CREATE TABLE "ReferralLink" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaignId" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "url" TEXT NOT NULL,
  "utm" TEXT NOT NULL
);
CREATE TABLE "TrackedEvent" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "linkCode" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ComplianceRule" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT 1
);
