# GLO-0001: Example — billing

- Status: active

<!-- This is a filled-in example showing the expected level of detail.
     Replace it with a real domain area, or delete the file. -->

## Invoice

**Definition.** A statement of amounts owed by one customer for a fixed period,
issued once and never modified afterwards.

- **Aliases / Acronyms**: bill (in customer-facing copy only — avoid in code)
- **Context**: Billing module. An invoice exists only after a period closes; the
  running total before that is an *unbilled balance*, which is a different thing.
- **Related**: Unbilled balance, Credit note
- **Source**: `src/billing/invoice.ts:14`

## Credit note

**Definition.** A document that reduces an amount already invoiced. Because an
invoice is never modified, this is the only mechanism by which a customer's owed
amount can decrease.

- **Aliases / Acronyms**: refund (imprecise — a refund is the payment that may
  follow a credit note, not the note itself)
- **Context**: Billing module. Issued against exactly one invoice.
- **Related**: Invoice
- **Source**: `src/billing/credit-note.ts:9`
