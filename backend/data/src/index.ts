export { openDatabase, type DB, type OpenOptions } from './db/connection.ts';
export { migrate } from './db/migrator.ts';
export { resolveDbPath, LegacyDbError } from './db/default-db-path.ts';
export { MIGRATIONS, type Migration } from './db/schema.ts';
export { SqliteRepository } from './db/sqlite-repository.ts';
export { importFit, FitParseError, type ParsedFitRun } from './importers/fit-importer.ts';
export { type RawStrengthSession, type RawStrengthSet } from './importers/strength-import-types.ts';
export {
  validateManualStrengthInput,
  MANUAL_STRENGTH_DEFAULT_TITLE,
  toRawStrengthSession,
  manualStrengthSourceHash,
  ManualStrengthValidationError,
  type ManualStrengthExerciseInput,
  type ManualStrengthSessionInput,
  type ManualStrengthSetInput,
} from './importers/manual-strength-importer.ts';
export {
  parseGarminWellnessJson,
  type GarminWellnessDay,
  type GarminWellnessJson,
  type GarminJsonParse,
} from './importers/garmin-json-importer.ts';
export { OpenMeteoClient, type FetchLike, type OpenMeteoOptions } from './weather/open-meteo-client.ts';
export {
  searchManga,
  searchMangaByAuthor,
  searchMangaEnglishEditions,
  enrichEnglishEditions,
  mergeTitleAndAuthorHits,
  authorNameMatches,
  englishVolumeCountsByAuthor,
  applyEnglishCounts,
  withEnglishCounts,
  searchBooks,
  type EnglishCount,
  type MangaCandidate,
  type MangaRelation,
} from './manga-lookup.ts';
export { GOOGLE_BOOKS_KEY_SETTING, GOOGLE_BOOKS_KEY_PATTERN, resolveBooksKey, testBooksKey, type BooksKeySource, type BooksKeyTest } from './google-books-key.ts';
export { scoredStrengthSets } from './queries.ts';
export { assembleDashboard } from './dashboard.ts';
export {
  deleteLoggedStrengthSession,
  listLoggedStrengthSessions,
  logStrengthSession,
  MAX_REPS,
  MAX_WEIGHT_KG,
  type LogStrengthResult,
} from './strength-log.ts';
export { recomputeStats, type RecomputeResult } from './recompute-service.ts';
export {
  syncGarmin,
  computeGarminWindows,
  GarminSyncError,
  type GarminSyncOptions,
  type GarminSyncSummary,
  type GarminFetchArgs,
  type GarminFetchResult,
  type GarminWindows,
  type RunFetcher,
} from './garmin-sync.ts';
export { priceTablePath, readPriceTable, quoteNextVolume, recordVolumeBought, type VolumeQuote, type VolumeBuyInput, type VolumeBuyResult } from './volume-purchase.ts';
export {
  ingestRunFromFit,
  ingestManualStrengthSession,
  buildStrengthSessionInput,
  conventionDates,
  ingestGarminWellnessJson,
  backfillRunWeather,
  type IngestResult,
  type ManualStrengthIngestResult,
  type SameDayStrengthConflict,
  type ConventionDates,
  type GarminJsonIngestSummary,
  type WeatherBackfillSummary,
} from './ingest-pipeline.ts';
