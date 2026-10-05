
WITH ranked AS (
  SELECT vapi_call_id
  FROM call_analyses
  ORDER BY created_at DESC
  LIMIT 20
)
UPDATE call_analyses ca
SET intent = CASE
  WHEN ca.ended_reason ILIKE '%customer-did-not-answer%' OR ca.ended_reason ILIKE '%no-answer%' THEN 'no_answer'
  WHEN ca.ended_reason ILIKE '%customer-busy%' THEN 'busy'
  WHEN ca.ended_reason ILIKE '%voicemail%' THEN 'voicemail'
  WHEN ca.ended_reason ILIKE '%silence-timed-out%' THEN 'ivr_blocked'
  WHEN ca.ended_reason ILIKE '%twilio-failed%' OR ca.ended_reason ILIKE '%provider-closed-websocket%' OR ca.ended_reason ILIKE '%failed-to-connect%' THEN 'connect_failed'
  WHEN ca.ended_reason ILIKE 'call.start.error%' THEN 'call_failed'
  WHEN ca.ended_reason ILIKE '%customer-ended-call%' THEN 'customer_ended_call'
  WHEN ca.ended_reason ILIKE '%assistant-ended-call%' THEN 'assistant_ended_call'
  ELSE ca.intent
END
WHERE ca.vapi_call_id IN (SELECT vapi_call_id FROM ranked)
  AND (ca.intent IS NULL OR ca.intent IN ('unclear','ivr_blocked'))
  AND NOT (ca.ended_reason ILIKE '%silence-timed-out%' AND ca.intent = 'ivr_blocked');
