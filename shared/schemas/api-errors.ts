/**
 * Codes d'erreur API stables (snake_case anglais).
 * Source de vérité pour le mapping côté client (useApiError.mapError).
 *
 * Convention : ajouter un nouveau code ici AVANT de l'utiliser dans un endpoint.
 * Le composable useApiError.ts DOIT être tenu à jour en parallèle (mapping FR).
 */
export const ApiErrorCode = {
  ValidationFailed: 'validation_failed',
  NotFound: 'not_found',
  Unauthorized: 'unauthorized',
  /** Cookie `pf_profile` absent/invalide et plus d'un profil en base (D38, story 27.2). */
  ProfileRequired: 'profile_required',
  /** Nom de profil déjà pris, comparaison insensible à la casse et aux espaces (story 27.3). */
  ProfileNameTaken: 'profile_name_taken',

  // Domaine — Statements / Ingestion
  PdfAlreadyIngested: 'pdf_already_ingested',
  PdfParseFailed: 'pdf_parse_failed',
  PeriodOverlap: 'period_overlap',
  /** Le relevé déposé n'est pas de la banque sélectionnée (FR78, AR38). */
  BankMismatch: 'bank_mismatch',
  /**
   * Fichier non reconnu comme un relevé PDF ni comme un export Excel supporté (AR39, story
   * 28.4). Réutilisé par 28.2 pour le même refus côté export.
   */
  StatementFormatUnrecognized: 'statement_format_unrecognized',
  LlmExtractionFailed: 'llm_extraction_failed',
  LlmUnavailable: 'llm_unavailable',
  /**
   * Clé d'API absente, invalide ou sans droit (401/403). Distinct de `llm_unavailable` :
   * réessayer ne sert à rien, seule une correction de configuration débloque (story 17.5).
   */
  LlmConfigError: 'llm_config_error',

  // Domaine — Réconciliation
  ReconciliationFailed: 'reconciliation_failed',

  // Domaine — Référentiel (rubriques et postes)
  CategoryInUse: 'category_in_use',
  CategoryProtected: 'category_protected',
  CategoryLabelTaken: 'category_label_taken',
  CategoriesNotSeeded: 'categories_not_seeded',
  /** Rubrique encore peuplée : la supprimer orphelinerait ses postes (FR18). */
  GroupNotEmpty: 'group_not_empty',
  /** `groupCode` inconnu à la création d'un poste. */
  GroupNotFound: 'group_not_found',

  // Domaine — Règles de classement
  /** Un motif identique existe déjà : deux règles concurrentes seraient indéchiffrables. */
  RuleAlreadyExists: 'rule_already_exists',
} as const

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode]
