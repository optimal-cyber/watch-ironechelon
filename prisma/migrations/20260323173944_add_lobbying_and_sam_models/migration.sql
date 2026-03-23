-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subTypes" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL DEFAULT '',
    "headquartersCountryId" TEXT,
    "headquartersCity" TEXT,
    "founded" INTEGER,
    "website" TEXT,
    "alsoKnownAs" TEXT NOT NULL DEFAULT '[]',
    "fundingType" TEXT,
    "ticker" TEXT,
    "stockExchange" TEXT,
    "cageCode" TEXT,
    "uei" TEXT,
    "naicsCodes" TEXT NOT NULL DEFAULT '[]',
    "employeeCount" TEXT,
    "annualRevenue" TEXT,
    "isin" TEXT,
    "logoUrl" TEXT,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "providingTo" TEXT NOT NULL DEFAULT '[]',
    "surveilling" TEXT NOT NULL DEFAULT '[]',
    "hasDirectTargets" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entity_headquartersCountryId_fkey" FOREIGN KEY ("headquartersCountryId") REFERENCES "Country" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceEntityId" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "description" TEXT,
    "value" REAL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "confidence" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Connection_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Connection_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "alpha2" TEXT NOT NULL,
    "alpha3" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "region" TEXT
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "awardId" TEXT,
    "entityId" TEXT NOT NULL,
    "agencyId" TEXT,
    "description" TEXT,
    "value" REAL,
    "awardDate" DATETIME,
    "endDate" DATETIME,
    "naicsCode" TEXT,
    "psc" TEXT,
    "placeOfPerformance" TEXT,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "sbirProgram" TEXT,
    "sbirPhase" TEXT,
    "sbirTopicCode" TEXT,
    "sbirAgency" TEXT,
    "sbirBranch" TEXT,
    "sbirAwardYear" INTEGER,
    "sbirAbstract" TEXT,
    "sbirKeywords" TEXT,
    "sbirPiName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contract_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundingRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "roundType" TEXT,
    "amount" REAL,
    "date" DATETIME,
    "investors" TEXT NOT NULL DEFAULT '[]',
    "sources" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundingRound_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NewsItemEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newsItemId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    CONSTRAINT "NewsItemEntity_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NewsItemEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submitterEmail" TEXT,
    "entityName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "website" TEXT,
    "headquartersCountry" TEXT,
    "description" TEXT NOT NULL,
    "connectionInfo" TEXT,
    "sourceUrls" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FedrampAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "csoName" TEXT NOT NULL,
    "cspName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "impactLevel" TEXT,
    "serviceModel" TEXT NOT NULL DEFAULT '[]',
    "deploymentModel" TEXT,
    "authorizationDate" DATETIME,
    "expirationDate" DATETIME,
    "sponsoringAgency" TEXT,
    "leveragingAgencies" TEXT NOT NULL DEFAULT '[]',
    "assessorName" TEXT,
    "authType" TEXT,
    "serviceDescription" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DodProvisionalAuth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "csoName" TEXT NOT NULL,
    "cspName" TEXT NOT NULL,
    "impactLevel" TEXT NOT NULL,
    "paDate" DATETIME,
    "paExpiration" DATETIME,
    "sponsorComponent" TEXT,
    "conditions" TEXT,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmassAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "systemName" TEXT NOT NULL,
    "systemId" TEXT,
    "component" TEXT NOT NULL,
    "authorizationType" TEXT NOT NULL,
    "authorizationDate" DATETIME,
    "expirationDate" DATETIME,
    "impactLevel" TEXT,
    "authorizingOfficial" TEXT,
    "issm" TEXT,
    "isso" TEXT,
    "systemType" TEXT,
    "hostedLocation" TEXT,
    "cloudProvider" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "importBatchId" TEXT,
    "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AtoCompany" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalName" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "cageCode" TEXT,
    "uei" TEXT,
    "website" TEXT,
    "sector" TEXT,
    "smallBusiness" BOOLEAN NOT NULL DEFAULT false,
    "sbTypes" TEXT NOT NULL DEFAULT '[]',
    "totalActiveAuths" INTEGER NOT NULL DEFAULT 0,
    "authVelocity" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AtoSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordsAdded" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FederalContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "awardId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientUei" TEXT,
    "awardingAgency" TEXT,
    "awardingSubAgency" TEXT,
    "awardAmount" REAL,
    "description" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "naicsCode" TEXT,
    "atoRelevanceScore" INTEGER NOT NULL DEFAULT 0,
    "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AtoAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LobbyingFiling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingId" TEXT NOT NULL,
    "registrantName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "filingType" TEXT,
    "filingYear" INTEGER,
    "filingPeriod" TEXT,
    "amount" REAL,
    "issues" TEXT NOT NULL DEFAULT '[]',
    "lobbyists" TEXT NOT NULL DEFAULT '[]',
    "governmentEntities" TEXT NOT NULL DEFAULT '[]',
    "specificIssues" TEXT,
    "entityId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'senate-lda',
    "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SamRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uei" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "cageCode" TEXT,
    "duns" TEXT,
    "physicalAddress" TEXT,
    "mailingAddress" TEXT,
    "congressionalDistrict" TEXT,
    "naicsCodes" TEXT NOT NULL DEFAULT '[]',
    "pscCodes" TEXT NOT NULL DEFAULT '[]',
    "businessTypes" TEXT NOT NULL DEFAULT '[]',
    "entityStructure" TEXT,
    "stateOfIncorp" TEXT,
    "fiscalYearEnd" TEXT,
    "entityUrl" TEXT,
    "registrationDate" DATETIME,
    "expirationDate" DATETIME,
    "activeStatus" TEXT,
    "entityId" TEXT,
    "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Entity_slug_key" ON "Entity"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_externalId_key" ON "Entity"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_sourceEntityId_targetEntityId_connectionType_key" ON "Connection"("sourceEntityId", "targetEntityId", "connectionType");

-- CreateIndex
CREATE UNIQUE INDEX "Country_alpha2_key" ON "Country"("alpha2");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_awardId_key" ON "Contract"("awardId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_url_key" ON "NewsItem"("url");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItemEntity_newsItemId_entityId_key" ON "NewsItemEntity"("newsItemId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FedrampAuthorization_packageId_key" ON "FedrampAuthorization"("packageId");

-- CreateIndex
CREATE INDEX "FedrampAuthorization_status_idx" ON "FedrampAuthorization"("status");

-- CreateIndex
CREATE INDEX "FedrampAuthorization_impactLevel_idx" ON "FedrampAuthorization"("impactLevel");

-- CreateIndex
CREATE INDEX "FedrampAuthorization_cspName_idx" ON "FedrampAuthorization"("cspName");

-- CreateIndex
CREATE INDEX "FedrampAuthorization_sponsoringAgency_idx" ON "FedrampAuthorization"("sponsoringAgency");

-- CreateIndex
CREATE INDEX "FedrampAuthorization_expirationDate_idx" ON "FedrampAuthorization"("expirationDate");

-- CreateIndex
CREATE INDEX "DodProvisionalAuth_impactLevel_idx" ON "DodProvisionalAuth"("impactLevel");

-- CreateIndex
CREATE INDEX "DodProvisionalAuth_cspName_idx" ON "DodProvisionalAuth"("cspName");

-- CreateIndex
CREATE UNIQUE INDEX "DodProvisionalAuth_csoName_cspName_impactLevel_key" ON "DodProvisionalAuth"("csoName", "cspName", "impactLevel");

-- CreateIndex
CREATE INDEX "EmassAuthorization_component_idx" ON "EmassAuthorization"("component");

-- CreateIndex
CREATE INDEX "EmassAuthorization_impactLevel_idx" ON "EmassAuthorization"("impactLevel");

-- CreateIndex
CREATE INDEX "EmassAuthorization_expirationDate_idx" ON "EmassAuthorization"("expirationDate");

-- CreateIndex
CREATE INDEX "EmassAuthorization_authorizationType_idx" ON "EmassAuthorization"("authorizationType");

-- CreateIndex
CREATE UNIQUE INDEX "EmassAuthorization_systemName_component_key" ON "EmassAuthorization"("systemName", "component");

-- CreateIndex
CREATE UNIQUE INDEX "AtoCompany_canonicalName_key" ON "AtoCompany"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "AtoSyncLog_source_key" ON "AtoSyncLog"("source");

-- CreateIndex
CREATE UNIQUE INDEX "FederalContract_awardId_key" ON "FederalContract"("awardId");

-- CreateIndex
CREATE INDEX "FederalContract_awardingAgency_idx" ON "FederalContract"("awardingAgency");

-- CreateIndex
CREATE INDEX "FederalContract_atoRelevanceScore_idx" ON "FederalContract"("atoRelevanceScore");

-- CreateIndex
CREATE INDEX "FederalContract_recipientName_idx" ON "FederalContract"("recipientName");

-- CreateIndex
CREATE INDEX "AtoAlert_acknowledged_idx" ON "AtoAlert"("acknowledged");

-- CreateIndex
CREATE INDEX "AtoAlert_type_idx" ON "AtoAlert"("type");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyingFiling_filingId_key" ON "LobbyingFiling"("filingId");

-- CreateIndex
CREATE INDEX "LobbyingFiling_registrantName_idx" ON "LobbyingFiling"("registrantName");

-- CreateIndex
CREATE INDEX "LobbyingFiling_clientName_idx" ON "LobbyingFiling"("clientName");

-- CreateIndex
CREATE INDEX "LobbyingFiling_filingYear_idx" ON "LobbyingFiling"("filingYear");

-- CreateIndex
CREATE INDEX "LobbyingFiling_entityId_idx" ON "LobbyingFiling"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SamRegistration_uei_key" ON "SamRegistration"("uei");

-- CreateIndex
CREATE INDEX "SamRegistration_entityName_idx" ON "SamRegistration"("entityName");

-- CreateIndex
CREATE INDEX "SamRegistration_cageCode_idx" ON "SamRegistration"("cageCode");

-- CreateIndex
CREATE INDEX "SamRegistration_entityId_idx" ON "SamRegistration"("entityId");
