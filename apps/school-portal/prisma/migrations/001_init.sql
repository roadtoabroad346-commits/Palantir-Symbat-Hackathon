CREATE TABLE "School" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "consentConfirmed" BOOLEAN NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Teacher" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "schoolId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" TEXT NOT NULL
);
CREATE TABLE "ClassGroup" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "gradeRange" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "active" BOOLEAN NOT NULL
);
CREATE TABLE "StudentEntry" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "classId" TEXT NOT NULL,
  "nickname" TEXT NOT NULL,
  "studentRef" TEXT NOT NULL UNIQUE,
  "stage" INTEGER NOT NULL,
  "status" TEXT NOT NULL
);
CREATE TABLE "LessonKit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "order" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "objectives" TEXT NOT NULL,
  "steps" TEXT NOT NULL,
  "stageRange" TEXT NOT NULL
);
CREATE TABLE "Report" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "schoolId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dataJson" TEXT NOT NULL
);
CREATE TABLE "PartnerNote" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "schoolId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
