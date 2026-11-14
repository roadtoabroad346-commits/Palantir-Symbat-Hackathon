CREATE TABLE "Challenge" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "title" TEXT NOT NULL,
  "theme" TEXT NOT NULL,
  "startAt" DATETIME NOT NULL,
  "endAt" DATETIME NOT NULL,
  "status" TEXT NOT NULL,
  "rubricJson" TEXT NOT NULL,
  "weightsJson" TEXT NOT NULL,
  "frozenJson" TEXT
);
CREATE TABLE "Team" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "challengeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "schoolCode" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "TeamMember" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "teamId" TEXT NOT NULL,
  "studentRef" TEXT NOT NULL,
  "nickname" TEXT NOT NULL,
  "country" TEXT NOT NULL
);
CREATE TABLE "ProgressSnapshot" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "teamId" TEXT NOT NULL,
  "started" INTEGER NOT NULL,
  "published" INTEGER NOT NULL,
  "avgStage" REAL NOT NULL,
  "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "JudgeScore" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "teamId" TEXT NOT NULL,
  "judgeId" TEXT NOT NULL,
  "criteriaJson" TEXT NOT NULL,
  "total" REAL NOT NULL
);
CREATE TABLE "Badge" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL
);
CREATE TABLE "TeamBadge" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "teamId" TEXT NOT NULL,
  "badgeId" TEXT NOT NULL,
  "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
