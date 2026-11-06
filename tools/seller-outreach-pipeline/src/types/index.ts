export interface SellerInfo {
  name: string;
  platform: 'BASE' | 'STORES' | 'OTHER';
  storeUrl: string;
  contactFormUrl: string | null;
  email: string | null;
  categories: string[];
  mainProducts: Array<{ name: string; url: string }>;
  features: string;
  fetchedAt: string;
  sourceUrls: string[];
}

/** Approved aggregate export, never raw individual search histories. */
export interface DemandRecord {
  keyword: string;
  monthlySearchVolume: number;
  unmetSearchCount: number;
  periodStart: string;
  periodEnd: string;
  timezone: 'Asia/Tokyo';
  qaInternalExcluded: true;
  complete: true;
  source: string;
}

export interface DemandMatchResult extends DemandRecord {
  matchedKeyword: string;
  relevanceScore: number;
}

export interface Pitch {
  subject: string;
  body: string;
  featureQuote: string;
  evidence: DemandMatchResult;
  offerVersion: 'sample-30d-20261024';
  generatedAt: string;
}

export interface SenderInfo {
  name: string;
  email: string;
  company: string;
}

export type SubmissionStatus =
  | 'DRY_RUN' | 'SKIPPED' | 'DUPLICATE' | 'SUBMITTED' | 'UNKNOWN';

export interface SubmissionResult {
  status: SubmissionStatus;
  reason: string;
  screenshot?: string;
}
