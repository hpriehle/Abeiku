-- Delete partner-link "clicks" left by bots, link previews and scripts (e.g. our curl tests).
-- Same rule as isCountableClick() in src/lib/partner/clicks.ts; stats already skip these rows,
-- so this only tidies the table. DO NOT RUN without Harrison's yes: it deletes data.
-- Repeat visits within 30 minutes are not touched here (they were real people).

BEGIN;

-- 1. Look first: what would go (2026-11-19 expectation: the 6 curl/8.5.0 rows).
SELECT user_agent, count(*)
FROM influencer_clicks
WHERE user_agent IS NULL
   OR btrim(user_agent) = ''
   OR user_agent ~* '(WhatsApp/|facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Googlebot|bingbot|Applebot|bot|crawler|spider|preview|curl|wget|python-requests|node-fetch|axios|Go-http-client|HeadlessChrome)'
GROUP BY user_agent
ORDER BY count(*) DESC;

-- 2. Delete them.
DELETE FROM influencer_clicks
WHERE user_agent IS NULL
   OR btrim(user_agent) = ''
   OR user_agent ~* '(WhatsApp/|facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Googlebot|bingbot|Applebot|bot|crawler|spider|preview|curl|wget|python-requests|node-fetch|axios|Go-http-client|HeadlessChrome)';

-- 3. Check the row count DELETE reported matches step 1, then COMMIT (or ROLLBACK).
-- COMMIT;
