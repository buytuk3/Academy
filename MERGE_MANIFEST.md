# MERGE_MANIFEST — BuyTuk Academy «المشروع الموحّد النظيف»
الإصدار: MM-1.0 · 2026-09-06 · الحالة: P1 ✅ + P2 ✅ (P2-Merge معتمد) — P3..P8 معلّقة

## 1) أصل الملفات (Origins)
| المسار في الحزمة | الأصل (Source) | ملاحظة النقل |
|---|---|---|
| packages/contracts/src/reading/types.ts | artifacts/reading-engine/src/types/index.ts | نقل حرفي (mv، SHA مطابق) |
| packages/contracts/src/events/learning-events.ts | جديد (عقود الأحداث الـ12 — العقد §12) | Facade/Contracts فقط |
| packages/contracts/src/index.ts · package.json · tsconfig.json | جديد | barrel واحد |
| packages/database/src/schema/{tenants,users,schools,sessions,gaps,system,index}.ts | lib/db/src/schema/* (git mv R100/R0xx) | موحّد uuid/tenant |
| packages/database/src/schema/reading.ts | جديد — من schema المحرك (serial→uuid/tenant) | 7 جداول قراءة |
| packages/database/src/client.ts | artifacts/reading-engine/src/db/index.ts (git mv) | Pool واحد canonical |
| packages/database/migrations/001_initial.sql | artifacts/reading-engine/src/db/migrations/001_initial.sql (git mv R100) | SHA مطابق لـ pre-merge |
| artifacts/reading-engine/src/db/schema.ts | أصل المحرك (14 جدولًا) — استُعيد حرفيًا من pre-merge | شيم انتقالي حتى P4 (لا يُحذف قبل نقل المستهلكين) |
| artifacts/reading-engine/src/db/index.ts | شيم توافق: @workspace/db (موحّد) + ./schema (قديم) | يُزال في P7 |
| artifacts/reading-engine/** | أصل محرك القراءة MOD-001 | 64 ملفًا — لم تُمس المنطق (tsc 0 + vitest 6/6) |
| artifacts/api-server/** | أصل api-server (Express 5) | يُدمج في apps/api لاحقًا (P4) |
| lib/api-spec · api-zod · api-client-react | أصل (منطقة lib المتبقية) | تُربط على contracts لاحقًا |

## 2) قرارات التعارضات المطبّقة (Conflict Resolutions)
| القرار | ما تم | المرجع |
|---|---|---|
| C-01a users | canonical = usersTable الموحّد + عمود username مدمج (nullable، لـ auth القديم حتى P4) | forensic §5/§6 |
| C-01b students | canonical = studentsTable الموحّد + دمج أعمدة المحرك المفقودة (display_name, grade, native_language) | forensic C-01b — مطبّق في P2-merge |
| C-01c teachers | canonical = user بدور teacher (لا جدول مستقل) | forensic C-01c |
| C-01d audit_logs | canonical = auditLogsTable الموحّد؛ يبقى «صامتًا» حتى تفعيل Audit Pipeline (لا حذف) | forensic C-01d |
| C-04 / ADR-008 | canonical = reading_sessions (مع دمج started_at/ended_at/is_completed) + شيم توافق مؤقت حتى P4 | forensic §7 |
| C-06 migrations | مصدر واحد = packages/database/migrations/001 (SHA مطابق) | forensic C-06 |
| C-07 is_active | students.is_active: timestamp → boolean NOT NULL default true | forensic C-07 — مطبّق في P2-merge |
| إزالة drizzle-zod | أُزيل من schema الموحّد و package.json (تعارض Zod v4/v3 موثق في ملاحظات المطور) — لا مستهلك | dev-notes |

## 3) بوابات التحقق المسجلة حتى الآن
| الفحص | النتيجة |
|---|---|
| tsc — engine | ENGINE_TSC_EXIT=0 |
| tsc — packages/database | DATABASE_TSC_EXIT=0 |
| tsc — packages/contracts | CONTRACTS_TSC_EXIT=0 |
| vitest — engine | 6/6 passed |
| schema المحرك حرفي (SHA) | PASS (7f9261…) |
| migration 001 حرفي (SHA) | PASS (a2fc60…) |

## 4) التوثيق ذو الصلة (مرفق في الحزمة)
ARCHITECTURE_CONTRACT.md (AC-1.0) · MOD-001_INTEGRATION_PLAN.md (IP-1.0) · P2_DATABASE_FORENSIC_REPORT.md (P2-FR-1.0) · COMPLETION_MAP.md · docs/buytuk-master/*
