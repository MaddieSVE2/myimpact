UPDATE org_members
SET role = 'manager'
FROM users, org_registrations, organisations
WHERE org_members.user_id = users.id
  AND org_members.org_id = organisations.id
  AND organisations.invite_code = org_registrations.invite_code
  AND LOWER(users.email) = LOWER(org_registrations.contact_email)
  AND org_registrations.status = 'approved';
