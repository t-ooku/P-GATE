// Previous Asia/Tokyo calendar day, not a rolling 24-hour window.
export function previousJstDay(now = new Date()) {
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const end = new Date(`${day}T00:00:00+09:00`);
  const start = new Date(end.getTime() - 86400000);
  return { timezone: 'Asia/Tokyo', date: new Date(start.getTime() + 9 * 3600000).toISOString().slice(0, 10),
    start_at: start.toISOString(), end_at: end.toISOString(), bounds: 'START_INCLUSIVE_END_EXCLUSIVE' };
}

export async function sellerFormFailureReasons(db) {
  try {
    const rows = (await db.prepare(`SELECT CASE
      WHEN content IN ('turnstile_unavailable','turnstile_unavailable_inapp','turnstile_pending',
        'validation_failed','turnstile_failed','timeout','network') THEN content
      WHEN content LIKE 'browser_validation:%' THEN 'browser_validation'
      WHEN content GLOB 'http_[0-9][0-9][0-9]' THEN 'http_error'
      ELSE 'other' END AS reason,
      COUNT(*) AS events,COUNT(DISTINCT NULLIF(session_id,'')) AS sessions,
      MAX(occurred_at) AS last_observed_at
      FROM growth_events WHERE event_type='seller_form_failed'
      AND traffic_class NOT IN ('QA','INTERNAL')
      AND datetime(occurred_at)>=datetime('now','-7 days')
      GROUP BY reason ORDER BY reason`).all()).results;
    return { status: 'AVAILABLE', rows, scope: 'QA_INTERNAL_EXCLUDED_7D_FIXED_REASON_ONLY' };
  } catch { return { status: 'UNAVAILABLE', reason: 'SELLER_FAILURE_AGGREGATE_QUERY_FAILED' }; }
}

export async function previousDayKpi(db, internalIds = [], now = new Date()) {
  const period = previousJstDay(now);
  const read = async sql => {
    try { return { status: 'AVAILABLE', rows: (await db.prepare(sql).bind(period.start_at, period.end_at).all()).results }; }
    catch { return { status: 'UNAVAILABLE', reason: 'DAILY_AGGREGATE_QUERY_FAILED' }; }
  };
  const events = await read(`SELECT event_type,COUNT(*) AS events,
    COUNT(DISTINCT NULLIF(session_id,'')) AS sessions
    FROM growth_events WHERE datetime(occurred_at)>=datetime(?1) AND datetime(occurred_at)<datetime(?2)
    AND traffic_class NOT IN ('QA','INTERNAL')
    AND event_type IN ('landing_view','search_started','search_completed','marketplace_click',
      'target_price_watch_set','seller_landing_view','seller_cta_clicked','seller_form_started','seller_form_submit_attempt')
    AND (event_type<>'seller_form_started' OR content='consultation_input')
    GROUP BY event_type ORDER BY event_type`);
  const count = type => events.status === 'AVAILABLE'
    ? { status: 'AVAILABLE', events: Number(events.rows.find(r=>r.event_type===type)?.events || 0),
      sessions: Number(events.rows.find(r=>r.event_type===type)?.sessions || 0) }
    : { status: 'UNAVAILABLE', reason: events.reason };
  // The server's recordTargetPriceWatchSet marks configured internal members QA.
  const watch = internalIds.length ? count('target_price_watch_set')
    : { status: 'UNAVAILABLE', reason: 'INTERNAL_MEMBER_EXCLUSION_NOT_CONFIGURED' };
  const inquiries = await read(`SELECT COUNT(*) AS total FROM seller_business_inquiries
    WHERE datetime(created_at)>=datetime(?1) AND datetime(created_at)<datetime(?2)`);
  // No identity/contact data is fetched. A nonzero raw count cannot establish
  // external acquisition: owner tests and externally verified inquiries need classification.
  const externalInquiries = inquiries.status === 'AVAILABLE' && Number(inquiries.rows[0]?.total) === 0
    ? { status: 'AVAILABLE', count: 0 }
    : { status: 'UNAVAILABLE', reason: inquiries.status !== 'AVAILABLE' ? inquiries.reason : 'EXTERNAL_INQUIRY_CLASSIFICATION_REQUIRED' };
  return { ...period, generated_at: now.toISOString(),
    scope: 'QA_INTERNAL_EXCLUDED_AGGREGATE_ONLY_NOT_PEOPLE_OR_ORDERS',
    landing: count('landing_view'), search_started: count('search_started'), search_completed: count('search_completed'),
    marketplace_click: count('marketplace_click'), general_watch_saved: watch,
    seller_landing: count('seller_landing_view'), seller_cta: count('seller_cta_clicked'),
    seller_input: count('seller_form_started'), seller_submit: count('seller_form_submit_attempt'),
    external_seller_inquiries: externalInquiries,
    new_paid_contracts: { status: 'UNAVAILABLE', reason: 'FIRST_PAID_CONTRACT_TIMESTAMP_NOT_CONNECTED_CURRENT_TOTAL_IS_NOT_DAILY_NEW' } };
}
