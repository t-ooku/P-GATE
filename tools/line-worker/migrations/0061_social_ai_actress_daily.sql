-- Daily v2 AI-actress inventory and fail-closed publishing metadata.
-- Rows using DAILY_AI_ACTRESS_22 may enter a publishable state only when the
-- exact day-specific creative is registered with persona, audio, rights, QA,
-- and AI-disclosure evidence.

CREATE TABLE IF NOT EXISTS social_creative_assets (
  asset_id TEXT PRIMARY KEY,
  media_url TEXT NOT NULL UNIQUE,
  media_sha256 TEXT NOT NULL
    CHECK(length(media_sha256)=64 AND media_sha256 NOT GLOB '*[^0-9a-f]*'),
  content_format TEXT NOT NULL CHECK(content_format IN ('IMAGE','REEL','STORY')),
  creative_policy TEXT NOT NULL DEFAULT '',
  jst_publish_date TEXT NOT NULL DEFAULT '',
  persona_id TEXT NOT NULL DEFAULT '',
  persona_age INTEGER NOT NULL DEFAULT 0 CHECK(persona_age BETWEEN 0 AND 120),
  ai_actress_present INTEGER NOT NULL DEFAULT 0 CHECK(ai_actress_present IN (0,1)),
  audio_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(audio_confirmed IN (0,1)),
  rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(rights_confirmed IN (0,1)),
  rights_ledger_id TEXT NOT NULL DEFAULT '',
  qa_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(qa_status IN ('PENDING','PASSED','FAILED')),
  ai_generated INTEGER NOT NULL DEFAULT 0 CHECK(ai_generated IN (0,1)),
  ai_disclosure_confirmed INTEGER NOT NULL DEFAULT 0
    CHECK(ai_disclosure_confirmed IN (0,1)),
  approved_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS social_creative_assets_daily_inventory
  ON social_creative_assets(creative_policy,jst_publish_date,qa_status);

INSERT OR IGNORE INTO social_creative_assets
  (asset_id,media_url,media_sha256,content_format,creative_policy,jst_publish_date,
   persona_id,persona_age,ai_actress_present,audio_confirmed,rights_confirmed,
   rights_ledger_id,qa_status,ai_generated,ai_disclosure_confirmed,
   approved_at,created_at,updated_at)
VALUES
  ('hoshilu_ai_actress_daily_sat_v1',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
   '04dc93f703b34c35cefaa14a9cf9c7e9c5d5d5b2080c93793e1ec9cb2bcf8641',
   'REEL','DAILY_AI_ACTRESS_22','2026-08-29','hoshilu-approved-model-reference-v2',
   22,1,1,1,'hoshilu_ai_actress_daily_sat_v1','PASSED',1,1,
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z'),
  ('hoshilu_ai_actress_daily_sun_v1',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-sun-v1.mp4',
   '13a2cbe9421b21866e101a416c60767b0d3d015d051206254e2614deb8368192',
   'REEL','DAILY_AI_ACTRESS_22','2026-08-30','hoshilu-approved-model-reference-v2',
   22,1,1,1,'hoshilu_ai_actress_daily_sun_v1','PASSED',1,1,
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z'),
  ('hoshilu_ai_actress_daily_mon_v1',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-mon-v1.mp4',
   'c4c748a6d4bd78182fe2164fea37826896934f59a7721d2d059dcb19042eeb5c',
   'REEL','DAILY_AI_ACTRESS_22','2026-08-31','hoshilu-approved-model-reference-v2',
   22,1,1,1,'hoshilu_ai_actress_daily_mon_v1','PASSED',1,1,
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z'),
  ('hoshilu_ai_actress_daily_tue_v1',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-tue-v1.mp4',
   '4319d171d872a45885d39a8a2bc15566a8ccedcd2596ddc97d11aff9f6e45ad0',
   'REEL','DAILY_AI_ACTRESS_22','2026-09-01','hoshilu-approved-model-reference-v2',
   22,1,1,1,'hoshilu_ai_actress_daily_tue_v1','PASSED',1,1,
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z'),
  ('hoshilu_ai_actress_daily_wed_v1',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-wed-v1.mp4',
   '3dc0d5da783b8bcdc6925ec0f8b32c123a0911494ad317b8ff05f28fc73ffd0a',
   'REEL','DAILY_AI_ACTRESS_22','2026-09-02','hoshilu-approved-model-reference-v2',
   22,1,1,1,'hoshilu_ai_actress_daily_wed_v1','PASSED',1,1,
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z'),
  ('hoshilu_ai_actress_daily_thu_v1',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-thu-v1.mp4',
   '544a0fe540108cbdfdface9eee528eee5314eecf6719ba6e64062d79ec250690',
   'REEL','DAILY_AI_ACTRESS_22','2026-09-03','hoshilu-approved-model-reference-v2',
   22,1,1,1,'hoshilu_ai_actress_daily_thu_v1','PASSED',1,1,
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z'),
  ('hoshilu_ai_actress_daily_fri_v1',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-fri-v1.mp4',
   '2367256ef25f806dc636b61ee2651c302165d62f082060bf5af01f1243e3fbf6',
   'REEL','DAILY_AI_ACTRESS_22','2026-09-04','hoshilu-approved-model-reference-v2',
   22,1,1,1,'hoshilu_ai_actress_daily_fri_v1','PASSED',1,1,
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z');

ALTER TABLE social_post_queue
  ADD COLUMN creative_asset_id TEXT NOT NULL DEFAULT '';
ALTER TABLE social_post_queue
  ADD COLUMN content_format TEXT NOT NULL DEFAULT ''
    CHECK(content_format IN ('','TEXT','IMAGE','REEL','STORY'));
ALTER TABLE social_post_queue
  ADD COLUMN creative_policy TEXT NOT NULL DEFAULT '';
ALTER TABLE social_post_queue
  ADD COLUMN jst_publish_date TEXT NOT NULL DEFAULT '';
ALTER TABLE social_post_queue
  ADD COLUMN ai_generated INTEGER NOT NULL DEFAULT 0 CHECK(ai_generated IN (0,1));
ALTER TABLE social_post_queue
  ADD COLUMN crosspost_group_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS social_post_daily_ai_actress
  ON social_post_queue(creative_policy,jst_publish_date,platform,status);
CREATE UNIQUE INDEX IF NOT EXISTS social_post_daily_ai_actress_one_per_platform
  ON social_post_queue(platform,jst_publish_date)
  WHERE creative_policy='DAILY_AI_ACTRESS_22';

CREATE TRIGGER IF NOT EXISTS social_daily_ai_actress_insert_gate
BEFORE INSERT ON social_post_queue
WHEN (NEW.creative_policy='DAILY_AI_ACTRESS_22'
    OR NEW.campaign_id='hoshilu-ai-actress-daily-v1')
  AND NEW.status IN ('APPROVED','PUBLISHING','PUBLISHED')
BEGIN
  SELECT RAISE(ABORT,'SOCIAL_AI_ACTRESS_POLICY_REQUIRED')
  WHERE NEW.creative_policy<>'DAILY_AI_ACTRESS_22'
    OR NEW.campaign_id<>'hoshilu-ai-actress-daily-v1'
    OR NEW.platform NOT IN ('X','INSTAGRAM')
    OR NEW.content_format<>'REEL'
    OR NEW.ai_generated<>1
    OR length(NEW.jst_publish_date)<>10
    OR date(NEW.jst_publish_date) IS NULL
    OR NEW.jst_publish_date<>date(NEW.jst_publish_date)
    OR NEW.crosspost_group_id<>'hoshilu-ai-actress-daily-' || NEW.jst_publish_date
    OR NEW.content_id<>NEW.crosspost_group_id
    OR NEW.creative_asset_id<>'hoshilu_ai_actress_daily_' ||
      CASE strftime('%w',NEW.jst_publish_date)
        WHEN '0' THEN 'sun' WHEN '1' THEN 'mon' WHEN '2' THEN 'tue'
        WHEN '3' THEN 'wed' WHEN '4' THEN 'thu' WHEN '5' THEN 'fri'
        WHEN '6' THEN 'sat' ELSE 'invalid' END || '_v1'
    OR instr(NEW.caption,'※この動画はAI生成・AI加工映像です。')=0
    OR instr(NEW.caption,'#AI生成')=0
    OR strftime('%s',NEW.scheduled_at) IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM social_creative_assets a
      WHERE a.asset_id=NEW.creative_asset_id
        AND a.media_url=NEW.media_url
        AND a.content_format='REEL'
        AND a.creative_policy='DAILY_AI_ACTRESS_22'
        AND a.persona_id='hoshilu-approved-model-reference-v2'
        AND a.persona_age=22
        AND a.ai_actress_present=1
        AND a.audio_confirmed=1
        AND a.rights_confirmed=1
        AND trim(a.rights_ledger_id)<>''
        AND a.qa_status='PASSED'
        AND a.ai_generated=1
        AND a.ai_disclosure_confirmed=1
        AND strftime('%s',a.approved_at) IS NOT NULL
    );
END;

CREATE TRIGGER IF NOT EXISTS social_daily_ai_actress_update_gate
BEFORE UPDATE OF status,campaign_id,content_id,caption,media_url,scheduled_at,
  creative_asset_id,content_format,creative_policy,jst_publish_date,ai_generated,
  crosspost_group_id ON social_post_queue
WHEN (NEW.creative_policy='DAILY_AI_ACTRESS_22'
    OR NEW.campaign_id='hoshilu-ai-actress-daily-v1')
  AND NEW.status IN ('APPROVED','PUBLISHING','PUBLISHED')
BEGIN
  SELECT RAISE(ABORT,'SOCIAL_AI_ACTRESS_POLICY_REQUIRED')
  WHERE NEW.creative_policy<>'DAILY_AI_ACTRESS_22'
    OR NEW.campaign_id<>'hoshilu-ai-actress-daily-v1'
    OR NEW.platform NOT IN ('X','INSTAGRAM')
    OR NEW.content_format<>'REEL'
    OR NEW.ai_generated<>1
    OR length(NEW.jst_publish_date)<>10
    OR date(NEW.jst_publish_date) IS NULL
    OR NEW.jst_publish_date<>date(NEW.jst_publish_date)
    OR NEW.crosspost_group_id<>'hoshilu-ai-actress-daily-' || NEW.jst_publish_date
    OR NEW.content_id<>NEW.crosspost_group_id
    OR NEW.creative_asset_id<>'hoshilu_ai_actress_daily_' ||
      CASE strftime('%w',NEW.jst_publish_date)
        WHEN '0' THEN 'sun' WHEN '1' THEN 'mon' WHEN '2' THEN 'tue'
        WHEN '3' THEN 'wed' WHEN '4' THEN 'thu' WHEN '5' THEN 'fri'
        WHEN '6' THEN 'sat' ELSE 'invalid' END || '_v1'
    OR instr(NEW.caption,'※この動画はAI生成・AI加工映像です。')=0
    OR instr(NEW.caption,'#AI生成')=0
    OR strftime('%s',NEW.scheduled_at) IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM social_creative_assets a
      WHERE a.asset_id=NEW.creative_asset_id
        AND a.media_url=NEW.media_url
        AND a.content_format='REEL'
        AND a.creative_policy='DAILY_AI_ACTRESS_22'
        AND a.persona_id='hoshilu-approved-model-reference-v2'
        AND a.persona_age=22
        AND a.ai_actress_present=1
        AND a.audio_confirmed=1
        AND a.rights_confirmed=1
        AND trim(a.rights_ledger_id)<>''
        AND a.qa_status='PASSED'
        AND a.ai_generated=1
        AND a.ai_disclosure_confirmed=1
        AND strftime('%s',a.approved_at) IS NOT NULL
    );
END;

INSERT OR IGNORE INTO social_post_queue
  (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,
   status,affiliate,approved_at,created_at,updated_at,creative_asset_id,
   content_format,creative_policy,jst_publish_date,ai_generated,crosspost_group_id)
VALUES
  ('hoshilu-ai-actress-daily-v1-x-2026-08-29','X','hoshilu-ai-actress-daily-v1',
   'hoshilu-ai-actress-daily-2026-08-29',
   '今日のバズ、もう見た？気になるランキングから次に欲しいものを見つけよう。※この動画はAI生成・AI加工映像です。 #HOSHILU #AI生成',
   'https://hoshilu.app/buzz?utm_source=x&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-29',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
   '2026-08-29T11:15:00.000Z','APPROVED',0,'2026-08-29T00:00:00.000Z',
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z',
   'hoshilu_ai_actress_daily_sat_v1','REEL','DAILY_AI_ACTRESS_22','2026-08-29',1,
   'hoshilu-ai-actress-daily-2026-08-29'),
  ('hoshilu-ai-actress-daily-v1-instagram-2026-08-29','INSTAGRAM',
   'hoshilu-ai-actress-daily-v1','hoshilu-ai-actress-daily-2026-08-29',
   '今日のバズ、もう見た？気になるランキングから次に欲しいものを見つけよう。※この動画はAI生成・AI加工映像です。 #HOSHILU #AI生成',
   'https://hoshilu.app/buzz?utm_source=instagram&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-29',
   'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
   '2026-08-29T11:15:00.000Z','APPROVED',0,'2026-08-29T00:00:00.000Z',
   '2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z',
   'hoshilu_ai_actress_daily_sat_v1','REEL','DAILY_AI_ACTRESS_22','2026-08-29',1,
   'hoshilu-ai-actress-daily-2026-08-29');
