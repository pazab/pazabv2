# PAZAB Development Progress Summary

## Implemented Features

- **Role Switch Tab on Onboarding Page**: Added UI tabs for "알바생으로 시작" and "사장님으로 시작" in `app/onboarding/page.tsx`. Selecting a tab updates `user_type` in the database.
- **Store Search Integration**: Unified store search and manual entry input in `app/invite/page.tsx`. Selecting a store shows address feedback.
- **Automatic Contract Draft Creation**: On invite acceptance, a draft contract entry is created in the `contracts` table and linked to the user.
- **Database Utilities**: Created `patch_user.mjs` and `clean_db.mjs` scripts for test account management (delete/reset user data).
- **Bug Fixes**: Resolved TSX tag mismatch causing `Unterminated regexp literal` error.

## Pending / Next Steps

- **Improve Visibility of Role Switch Tab**: Users reported difficulty finding the new tab; consider adding explanatory text or highlighting.
- **Profile Management**: Implement nickname change and account deletion functionality on the My Page.
- **Contract Completion Flow**: Decide whether detailed information (working hours, address, etc.) should be collected during onboarding or later in the contract signing step.
- **Store Address Handling**: Ensure full address and store name are correctly populated when only partial input is provided.

## Scripts

- `clean_db.mjs` – Clears test data from Supabase.
- `patch_user.mjs` – Updates test user fields.
- `test_query.mjs` – Example query script.

## Reference Files

- [app/onboarding/page.tsx](file:///c:/pazabv2/app/onboarding/page.tsx)
- [app/invite/page.tsx](file:///c:/pazabv2/app/invite/page.tsx)
- [package.json](file:///c:/pazabv2/package.json)

---
*Generated on 2026-06-30*
