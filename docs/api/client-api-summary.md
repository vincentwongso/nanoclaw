# FXBO Client API — Endpoint Summary

> Auto-generated. Regenerate: `npx tsx scripts/generate-api-summary.ts`

**Total:** 161 endpoints

---

## Accounts

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/accounts/types` | `get_fxbo_cabinet_api_account_types` |
| `POST` | `/client-api/accounts` | `post_fxbo_cabinet_api_accounts` |
| `POST` | `/client-api/accounts/update-custom-fields` | `post_fxbo_cabinet_api_accounts_update_custom_field` |
| `GET` | `/client-api/accounts/{loginSid}` | `get_fxbo_cabinet_api_get_account` |
| `POST` | `/client-api/accounts/new` | `post_fxbo_cabinet_api_accounts_new` |
| `POST` | `/client-api/accounts/change/password` | `post_fxbo_cabinet_api_change_password` |
| `POST` | `/client-api/accounts/change/leverage` | `post_fxbo_cabinet_api_change_leverage` |
| `POST` | `/client-api/accounts/trading-history` | `post_fxbo_cabinet_api_accounts_trading_history` |
| `GET` | `/client-api/accounts/{loginSid}/available-amount-for-withdrawal` | `get_fxbo_cabinet_api_accounts_get_available_amount` |
| `PUT` | `/client-api/accounts/change/send-report` | `put_fxbo_cabinet_api_accounts_change_send_report` |
| `GET` | `/client-api/accounts/{loginSid}/swap-free-request-form/` | `get_fxbo_cabinet_api_accounts_get_swap_free_request_form` |
| `POST` | `/client-api/accounts/{loginSid}/swap-free-request/` | `post_fxbo_cabinet_api_accounts_new_swap_free_request` |

## Applications

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/applications` | `get_fxbo_cabinet_api_applications` |
| `POST` | `/client-api/applications/upload` | `post_fxbo_cabinet_api_applications_upload` |
| `GET` | `/client-api/applications/configs` | `get_fxbo_cabinet_api_applications_configs` |
| `GET` | `/client-api/applications/configs/{id}` | `get_fxbo_cabinet_api_applications_configs_view` |

## Cashback Breakdown

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/cashback-breakdown` | `post_fxbo_cabinet_api_breakdown_cashback` |

## Charts

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/chart/{name}` | `get_fxbo_cabinet_api_charts_get_chart_data` |
| `GET` | `/client-api/charts-info` | `get_fxbo_cabinet_api_charts_get_chart_info` |

## Company Documents

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/company-documents/for-accept` | `get_fxbo_cabinet_api_company_document_for_accepted` |
| `GET` | `/client-api/company-documents/accepted` | `get_fxbo_cabinet_api_company_document_accepted_company_documents` |
| `POST` | `/client-api/company-documents/all` | `post_fxbo_cabinet_api_company_document_all` |
| `PUT` | `/client-api/company-documents/accept` | `put_fxbo_cabinet_api_company_document_accept` |
| `GET` | `/client-api/company-documents/{id}` | `get_fxbo_cabinet_api_company_document_view` |

## Custom Pages

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/custom-pages` | `get_fxbo_cabinet_api_custom_pages` |
| `GET` | `/client-api/custom-pages/{id}` | `get_fxbo_cabinet_api_custom_page_view` |

## Dict

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/dict/currencies` | `get_fxbo_cabinet_api_dict_currencies` |
| `GET` | `/client-api/dict/report-currency` | `get_fxbo_cabinet_api_dict_report_currency` |
| `GET` | `/client-api/dict/languages` | `get_fxbo_cabinet_api_dict_language_allowed` |

## Documents

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/documents` | `get_fxbo_cabinet_api_documents` |
| `DELETE` | `/client-api/documents/{id}` | `delete_fxbo_cabinet_api_delete` |
| `POST` | `/client-api/documents/upload` | `post_fxbo_cabinet_api_upload` |
| `GET` | `/client-api/documents/configs` | `get_fxbo_cabinet_api_configs` |

## Downloads

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/downloads` | `get_fxbo_cabinet_api_downloads` |

## Funds

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/convert/amount` | `post_fxbo_cabinet_api_psp_amount_convert` |
| `POST` | `/client-api/deposit` | `post_fxbo_cabinet_api_deposit` |
| `POST` | `/client-api/deposit/demo` | `post_fxbo_cabinet_api_deposit_demo` |
| `GET` | `/client-api/payment-systems/deposit` | `get_fxbo_cabinet_api_deposit_deposit_payment_systems` |
| `GET` | `/client-api/payment-systems/deposit/{loginSid}` | `get_fxbo_cabinet_api_deposit_deposit_payment_systems_login` |
| `POST` | `/client-api/deposit/fees` | `post_fxbo_cabinet_api_deposit_fees` |
| `POST` | `/client-api/payout/fees` | `post_fxbo_cabinet_api_payout_fees` |
| `POST` | `/client-api/payout` | `post_fxbo_cabinet_api_payout` |
| `POST` | `/client-api/withdrawal/detail` | `post_fxbo_cabinet_api_payout_detail` |
| `GET` | `/client-api/payment-systems/withdrawal` | `get_fxbo_cabinet_api_payout_payment_systems` |
| `GET` | `/client-api/payment-systems/withdrawal/{loginSid}` | `get_fxbo_cabinet_api_payout_payment_systems_login` |

## Help Desk

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/help-desk/ticket-comments/all` | `post_fxbo_cabinet_api_ticket_comment_list` |
| `POST` | `/client-api/help-desk/ticket-comments` | `post_fxbo_cabinet_api_ticket_comment_new` |
| `PUT` | `/client-api/help-desk/ticket-comments/{id}` | `put_fxbo_cabinet_api_ticket_comment_edit` |
| `DELETE` | `/client-api/help-desk/ticket-comments/{id}` | `delete_fxbo_cabinet_api_ticket_comment_delete` |
| `GET` | `/client-api/help-desk/tickets/open` | `get_fxbo_cabinet_api_ticket_opened_tickets` |
| `GET` | `/client-api/help-desk/tickets/closed` | `get_fxbo_cabinet_api_ticket_closed_tickets` |
| `POST` | `/client-api/help-desk/tickets/all` | `post_fxbo_cabinet_api_ticket_tickets` |
| `GET` | `/client-api/help-desk/ticket-categories` | `get_fxbo_cabinet_api_ticket_categories` |
| `POST` | `/client-api/help-desk/tickets` | `post_fxbo_cabinet_api_ticket_new` |
| `GET` | `/client-api/help-desk/unread-tickets-count` | `get_fxbo_cabinet_api_ticket_get_unread_tickets_count` |
| `GET` | `/client-api/help-desk/tickets/{id}` | `get_fxbo_cabinet_api_ticket_view` |
| `DELETE` | `/client-api/help-desk/tickets/{id}` | `delete_fxbo_cabinet_api_ticket_delete` |
| `POST` | `/client-api/help-desk/tickets/{id}/close` | `post_fxbo_cabinet_api_ticket_close` |

## IB

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/ib/commission-settings` | `get_fxbo_cabinet_api_ib_commission_settings` |
| `POST` | `/client-api/ib/banners` | `post_fxbo_cabinet_api_ib_banners` |
| `GET` | `/client-api/ib/banners/campaigns` | `get_fxbo_cabinet_api_ib_banners_campaigns` |
| `GET` | `/client-api/ib/banners/{id}/get-code/{linkId}` | `get_fxbo_cabinet_api_ib_banners_get_code` |
| `POST` | `/client-api/ib/referrals` | `post_fxbo_cabinet_api_ib_referrals` |
| `POST` | `/client-api/ib/referrals/accounts` | `post_fxbo_cabinet_api_ib_referrals_accounts` |
| `POST` | `/client-api/ib/referrals/accounts/trading-history` | `post_fxbo_cabinet_api_ib_referrals_accounts_trading_history` |
| `POST` | `/client-api/ib/commissions` | `post_fxbo_cabinet_api_ib_commissions` |
| `POST` | `/client-api/ib/ib-transactions` | `post_fxbo_cabinet_api_ib_transactions` |
| `GET` | `/client-api/ib/links` | `get_fxbo_cabinet_api_ib_links` |
| `GET` | `/client-api/ib/links/landing-pages` | `get_fxbo_cabinet_api_ib_links_landing_pages` |
| `POST` | `/client-api/ib/links/new` | `post_fxbo_cabinet_api_ib_links_new` |
| `POST` | `/client-api/ib/links/{id}/edit` | `post_fxbo_cabinet_api_ib_links_edit` |
| `DELETE` | `/client-api/ib/links/{id}` | `delete_fxbo_cabinet_api_ib_links_delete` |
| `GET` | `/client-api/ib/public/link-detail/{id}/` | `get_fxbo_cabinet_api_ib_public_link_detail` |
| `GET` | `/client-api/ib/public/link-detail/{id}/click/` | `get_fxbo_cabinet_api_ib_public_link_click` |
| `POST` | `/client-api/ib/reports/other-network-commissions` | `post_fxbo_cabinet_api_ib_reports_other_network_commissions` |
| `POST` | `/client-api/ib/reports/other-network-accounts` | `post_fxbo_cabinet_api_ib_reports_other_network_accounts` |
| `POST` | `/client-api/ib/reports/accounts-commissions` | `post_fxbo_cabinet_api_ib_reports_other_accounts_commissions` |
| `POST` | `/client-api/ib/reports/clients-commissions` | `post_fxbo_cabinet_api_ib_reports_other_clients_commissions` |
| `POST` | `/client-api/ib/reports/cpa-payments` | `post_fxbo_cabinet_api_ib_reports_other_cpa_payments` |
| `POST` | `/client-api/ib/tree` | `post_fxbo_cabinet_api_ib_tree` |
| `POST` | `/client-api/ib/referral-breakdown/{id}` | `post_fxbo_cabinet_api_ib_referral_breakdown` |
| `GET` | `/client-api/ib/tiers/configuration` | `get_fxbo_cabinet_api_ib_tiers_configuration` |
| `GET` | `/client-api/ib/tiers/current-tier` | `get_fxbo_cabinet_api_ib_tiers_current` |
| `GET` | `/client-api/ib/tiers/configuration/commission-settings` | `get_fxbo_cabinet_api_ib_tiers_configuration_commission_settings` |
| `GET` | `/client-api/ib/performance-dashboard` | `get_fxbo_cabinet_api_ib_performance_dashboard` |

## KYC

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/kyc/global-pass/screening-token` | `get_fxbo_cabinet_api_kyc_global_pass_screening_token` |
| `GET` | `/client-api/kyc/identomat/session-token` | `get_fxbo_cabinet_api_kyc_identomat_session_token` |
| `GET` | `/client-api/kyc/sumsub/access-token` | `get_fxbo_cabinet_api_kyc_sum_sub_access_token` |

## Loyalty

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/loyalty/points` | `get_fxbo_cabinet_api_loyalty_points` |
| `POST` | `/client-api/loyalty/points` | `post_fxbo_cabinet_api_loyalty_points_list` |
| `POST` | `/client-api/loyalty/rewards/list` | `post_fxbo_cabinet_api_loyalty_redeem_rewards_list` |
| `POST` | `/client-api/loyalty/rewards/redeem` | `post_fxbo_cabinet_api_loyalty_redeem_reward_redeem` |
| `POST` | `/client-api/loyalty/redeem-items-applications` | `post_fxbo_cabinet_api_loyalty_redeem_items_applications` |

## Menu

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/menu` | `get_fxbo_cabinet_api_menu` |

## Notification

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/notifications/firebase/token` | `post_fxbo_cabinet_api_firebase_persist_token` |

## OAuth

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/oauth/url/{service}` | `post_fxbo_cabinet_api_login_social` |
| `POST` | `/client-api/oauth/auth/{service}` | `post_fxbo_cabinet_api_auth_service` |
| `POST` | `/client-api/oauth/connect/{service}` | `post_fxbo_cabinet_api_connect_social` |
| `POST` | `/client-api/oauth/disconnect/{service}` | `post_fxbo_cabinet_api_disconnect_social` |

## Payment Details

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/payment-details/{paymentSystemId}` | `get_fxbo_cabinet_api_payment_system_payment_details` |
| `GET` | `/client-api/payment-details` | `get_fxbo_cabinet_api_payment_details` |
| `DELETE` | `/client-api/payment-details/{id}` | `delete_fxbo_cabinet_api_payment_details_delete` |
| `POST` | `/client-api/payment-details/upload` | `post_fxbo_cabinet_api_payment_details_upload` |
| `GET` | `/client-api/payment-details/configs` | `get_fxbo_cabinet_api_payment_details_configs` |

## Profile

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/profile/messages` | `post_fxbo_cabinet_api_profile_messages` |
| `GET` | `/client-api/profile/messages/{id}` | `get_fxbo_cabinet_api_profile_messages_view` |
| `GET` | `/client-api/profile/messages/unread-count` | `get_fxbo_cabinet_api_profile_messages_unread_count` |
| `GET` | `/client-api/profile/notification-preferences/options` | `get_fxbo_cabinet_api_notification_preferences_options` |
| `POST` | `/client-api/profile/change/notification-preferences` | `post_fxbo_cabinet_api_notification_preferences_change` |
| `GET` | `/client-api/profile` | `get_fxbo_cabinet_api_profile` |
| `PUT` | `/client-api/profile` | `put_fxbo_cabinet_api_profile_update` |
| `GET` | `/client-api/profile-extended` | `get_fxbo_cabinet_api_profile_extended` |
| `POST` | `/client-api/profile/change-email` | `post_fxbo_cabinet_api_profile_change_email` |
| `POST` | `/client-api/profile/change-phone` | `post_fxbo_cabinet_api_profile_change_phone` |
| `POST` | `/client-api/profile/change-password` | `post_fxbo_cabinet_api_profile_change_password` |
| `GET` | `/client-api/profile/contact-manager-details` | `get_fxbo_cabinet_api_profile_contact_manager_details` |
| `POST` | `/client-api/profile/update-custom-fields/file` | `post_fxbo_cabinet_api_profile_upload_file_custom_fields` |
| `POST` | `/client-api/profile/update-custom-fields` | `post_fxbo_cabinet_api_profile_update_custom_field` |
| `DELETE` | `/client-api/profile/custom-fields` | `delete_fxbo_cabinet_api_profile_delete_custom_field` |
| `POST` | `/client-api/profile/change-language` | `post_fxbo_cabinet_api_profile_change_language` |
| `POST` | `/client-api/profile/verify-email` | `post_fxbo_cabinet_api_profile_verify_email` |
| `POST` | `/client-api/profile/verify-email/validate/{hash}` | `post_fxbo_cabinet_api_profile_verify_email_validate_hash` |
| `POST` | `/client-api/profile/phone/verify` | `post_fxbo_cabinet_api_profile_verify_phone` |

## Public

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/marketing/public/link-detail/{id}/` | `get_fxbo_cabinet_api_marketing_public_link_detail` |
| `GET` | `/client-api/marketing/public/link-detail/{id}/click/` | `get_fxbo_cabinet_api_marketing_public_link_click` |
| `GET` | `/client-api/ib/public/link-detail/{id}/` | `get_fxbo_cabinet_api_ib_public_link_detail` |
| `GET` | `/client-api/ib/public/link-detail/{id}/click/` | `get_fxbo_cabinet_api_ib_public_link_click` |

## Registration

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/registration/send-pin-by-token` | `post_fxbo_cabinet_api_registration_send_pin_by_token` |
| `POST` | `/client-api/registration/confirmation-by-token` | `post_fxbo_cabinet_api_registration_confirmation_by_token` |
| `GET` | `/client-api/registration` | `get_fxbo_cabinet_api_registration_registration_form` |
| `PUT` | `/client-api/registration` | `put_fxbo_cabinet_api_registration_registration_cabinet` |

## Security

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/login/direct` | `get_fxbo_cabinet_api_direct_login` |
| `POST` | `/client-api/forgot-password-send` | `post_fxbo_cabinet_api_forgot_password_send` |
| `POST` | `/client-api/forgot-password-restore` | `post_fxbo_cabinet_api_forgot_password_restore` |
| `POST` | `/client-api/pin/send` | `post_fxbo_cabinet_api_pin_send` |
| `POST` | `/client-api/pin/resend` | `post_fxbo_cabinet_api_pin_resend` |
| `POST` | `/client-api/pin/check` | `post_fxbo_cabinet_api_pin_check` |
| `POST` | `/client-api/login` | `post_fxbo_cabinet_api_security_login` |
| `POST` | `/client-api/2fa-check` | `post_fxbo_cabinet_api_security_two_factor` |
| `POST` | `/client-api/logout` | `post_fxbo_cabinet_api_security_logout` |
| `POST` | `/client-api/tokens/refresh` | `post_fxbo_cabinet_api_security_tokens_refresh` |
| `POST` | `/client-api/login/get_challenges` | `post_fxbo_cabinet_api_login_get_challenges` |

## System

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/debug/format` | `get_fxbo_cabinet_api_get_debug_format` |
| `POST` | `/client-api/debug/format` | `post_fxbo_cabinet_api_post_debug_format` |
| `GET` | `/client-api/configuration` | `get_fxbo_cabinet_api_configuration` |
| `GET` | `/client-api/custom-alerts` | `get_fxbo_cabinet_api_custom_alerts` |
| `GET` | `/client-api/file` | `get_fxbo_cabinet_api_file` |
| `GET` | `/client-api/ping` | `get_fxbo_cabinet_api_system_ping` |

## Transactions

| Method | Path | Operation ID |
|--------|------|-------------|
| `PATCH` | `/client-api/transactions/cancel/{id}` | `patch_fxbo_cabinet_api_transactions_cancel` |
| `POST` | `/client-api/transactions` | `post_fxbo_cabinet_api_transactions` |

## Transfers

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/transfers/` | `post_fxbo_cabinet_api_transfers_list` |
| `POST` | `/client-api/transfers/check` | `post_fxbo_cabinet_api_transfers_check` |
| `POST` | `/client-api/transfers/new` | `post_fxbo_cabinet_api_transfers_new` |
| `POST` | `/client-api/transfers/any/new` | `post_fxbo_cabinet_api_transfers_any_new` |
| `POST` | `/client-api/transfers/convert/rate` | `post_fxbo_cabinet_api_transfers_convert_rate` |
| `PATCH` | `/client-api/transfers/{id}/decline` | `patch_fxbo_cabinet_api_transfers_decline` |

## TwoFactor

| Method | Path | Operation ID |
|--------|------|-------------|
| `POST` | `/client-api/profile/two-factor/qr-code` | `post_fxbo_cabinet_api_profile_two_factor_qr_code` |
| `PUT` | `/client-api/profile/two-factor/enable` | `put_fxbo_cabinet_api_profile_two_factor_enable` |
| `DELETE` | `/client-api/profile/two-factor` | `delete_fxbo_cabinet_api_profile_two_factor_disable` |
| `PATCH` | `/client-api/profile/two-factor/clear-trusted` | `patch_fxbo_cabinet_api_profile_two_factor_clear_trusted` |
| `POST` | `/client-api/profile/two-factor/generate-backup-codes` | `post_fxbo_cabinet_api_profile_two_factor_generate_backup_codes` |

## Widgets

| Method | Path | Operation ID |
|--------|------|-------------|
| `GET` | `/client-api/widgets` | `get_fxbo_cabinet_api_widgets` |
| `GET` | `/client-api/widgets/{alias}` | `get_fxbo_cabinet_api_get_widget` |

