-- Remove duplicate transactions where normalized recipient+description match.
-- Keeps the oldest row (lowest id) per duplicate group.
-- Scoped to tenant_id = 7. Legitimate same-day/same-amount pairs with different
-- descriptions (e.g. two PayPal charges) are preserved.

BEGIN;

CREATE TEMP TABLE norm_tx AS
SELECT
    t.id,
    t.tenant_id,
    t.account_id,
    t.transaction_date,
    t.amount,
    t.currency,
    t.transaction_type,
    trim(both from regexp_replace(
        regexp_replace(lower(decrypt_tenant_data(t.encrypted_recipient, t.tenant_id)), '[\"''\s]+', ' ', 'g'),
        '^\s+|\s+$', '', 'g'
    )) AS norm_recipient,
    trim(both from regexp_replace(
        regexp_replace(lower(decrypt_tenant_data(t.encrypted_description, t.tenant_id)), '[\"''\s]+', ' ', 'g'),
        '^\s+|\s+$', '', 'g'
    )) AS norm_description
FROM transactions t
WHERE t.tenant_id = 7;

CREATE TEMP TABLE dup_delete AS
SELECT n2.id
FROM norm_tx n1
JOIN norm_tx n2
  ON n1.tenant_id = n2.tenant_id
 AND n1.account_id = n2.account_id
 AND n1.transaction_date = n2.transaction_date
 AND n1.amount = n2.amount
 AND n1.currency = n2.currency
 AND n1.transaction_type = n2.transaction_type
 AND n1.norm_description = n2.norm_description
 AND n1.id < n2.id
 AND (
    n1.norm_recipient = n2.norm_recipient
    OR n1.norm_recipient LIKE n2.norm_recipient || ' %'
    OR n2.norm_recipient LIKE n1.norm_recipient || ' %'
 );

SELECT COUNT(*) AS rows_to_delete FROM dup_delete;

DELETE FROM transactions WHERE id IN (SELECT id FROM dup_delete);

COMMIT;
