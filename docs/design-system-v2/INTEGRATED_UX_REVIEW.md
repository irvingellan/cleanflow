# Independent integrated UX review

Fresh read-only reviewer: `/root/integrated_ux_review`.
Scope: real integrated localhost screens, desktop/mobile, navigation, labels,
context, history, confirmations and focus. No source changes by reviewer.

Findings resolved in the local harness:
- Client View all upcoming was inert: now opens Services with exact Client filter.
- Property Back dropped originating Client: preserves directory return context.
- Shell comparison reload dropped changed theme/language: URL stays synchronized.
- Payout summary received incompatible fields and rendered undefined jobs: no
  invented paid summary is supplied when synthetic payout evidence is absent.
- Completed fixture timestamps were in the future; now past instants. Archived
  history was duplicated in Client recent rows; active history excludes it.
- Detail/Back focus fell to body: heading and Services row focus restore safely.

Regression evidence: integrated.spec.js directory-context, preferences, payout
summary and focus tests; integratedContext.test.js past-history/context tests.
Follow-up navigation review also preserved existing Offers and New service forms.

Matrix/screenshots: 5 widths × 3 languages × 2 themes × Dashboard/Services/Detail.
43 final integrated tests pass with no horizontal overflow, runtime exception or
external request. Existing module suites cover modal/keyboard/reduced motion.
This is engineering review, not Gabi/owner integrated operator acceptance.
