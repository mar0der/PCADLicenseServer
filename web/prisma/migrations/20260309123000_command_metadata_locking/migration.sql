ALTER TABLE "Command" ADD COLUMN "displayNameLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Command" ADD COLUMN "manifestTitleLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Command" ADD COLUMN "descriptionLocked" BOOLEAN NOT NULL DEFAULT false;
