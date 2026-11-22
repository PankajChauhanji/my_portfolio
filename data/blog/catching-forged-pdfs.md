# The PDF Remembers: How We Catch Forged Bank Statements Before the Loan Goes Out

*A forged bank statement can look perfect on screen. Every font, every logo, every
running balance in place. But a PDF is not a picture — it's a small database with
a history, and editing it leaves fingerprints the eye can't see. This is how we
taught a system to read them.*

---

Every lending decision starts with a question that sounds simple: *can this person
repay?* And for most retail and small-business loans, the answer still arrives as a
PDF. Bank statements, salary slips, ITRs, invoices — uploaded by the applicant,
read by an underwriter, trusted by the credit model.

That trust is exactly what fraudsters attack. Change one salary credit from ₹38,000
to ₹83,000. Bump the closing balance. Swap a name. Remove a bounced cheque. Free PDF
editors make it a two-minute job, and the result is visually indistinguishable from
the original. Underwriters are good, but nobody can zoom into every digit of every
statement in a queue of thousands — and the good forgeries don't *look* edited at
all.

So we stopped asking "does this look right?" and started asking a better question:

> **Is this file still the file the bank's software produced?**

## A PDF is a database with a memory

Open a PDF in a text editor and you'll see what a viewer hides from you. It isn't
pixels — it's **objects**: pages, fonts, images, metadata, and *content streams*
that contain drawing instructions like "select this font, move here, paint these
characters". A cross-reference table indexes where every object lives.

Two properties of that format matter enormously for fraud detection:

1. **PDFs are designed to be appended, not rewritten.** Many editors save changes
   as an *incremental update* — new objects tacked onto the end of the file, with
   the old ones left in place. The original is often still in there.
2. **Every generator has habits.** A core-banking system that produces a million
   statements a day produces them the *same way* every time: the same object
   layout, the same font handling, the same order of drawing instructions. Humans
   with editors don't reproduce those habits — they can't even see them.

That second point is the heart of it. We don't need to know what was changed. We
need to know whether the file still behaves like its genuine siblings.

## What an edit leaves behind

Without getting into thresholds or exact rules, here are the families of evidence
a forensic engine can look for — each one cheap to compute and hard for a forger to
avoid:

**Structural leftovers.** Editors that append changes often leave *orphaned
objects* (written but never referenced), *free entries* in the cross-reference
table, duplicated catalog objects, or a second metadata block that disagrees with
the first — "created by the bank's system on Monday, modified by an online editor
on Thursday".

**Text that was patched in.** A genuine statement typically draws a line of text in
one consistent operation with one font. An edited amount is frequently drawn
*separately*: a new text block, sometimes a new font subset added just to render
the replacement digits, sometimes in an extra content stream appended to the page.
Mixed fonts inside a single text block, text drawn out of the generator's usual
order, or a lone block where there should be a table row — these are the
fingerprints of a patch.

**Covering instead of changing.** The lazy forgery doesn't edit the number; it
paints a white rectangle over it and writes a new number on top. Overlapping text
boxes, obfuscating shapes and images layered over text are all detectable — the
old value is often still sitting underneath.

**Annotations pretending to be content.** Some tools add text as an *annotation* —
a sticky layer floating above the page. It renders like real content; it isn't.

**Breaking the grammar.** This was the most interesting part to build. For each
issuing institution — and each *sub-format*, because banks run several statement
templates — we learn what a genuine content stream looks like as a sequence of
operations. You can think of it as a small automaton (a DFA) that accepts the way
that bank's software "speaks". A tampered page often still renders perfectly, but
its instruction sequence is no longer a sentence that grammar would produce.

## From signals to a decision someone can trust

Individually, every one of these signals has innocent explanations. Some banks
post-process their own statements. Password-protection tools rewrite files.
"Print to PDF" flattens everything. An engine that screams at every anomaly is
worse than useless — underwriters learn to ignore it within a week.

So the hard engineering wasn't detection. It was **calibration**:

- **Every check carries a weight, and the weight depends on the document type and
  institution.** A signal that's damning for one bank's statements is routine for
  another's. We keep strict, general and lenient profiles and tune per format,
  instead of pretending one threshold fits every PDF in India.
- **Know the format before you judge it.** Identifying the exact institution and
  sub-format first means each file is compared against the right "normal".
- **Return evidence, not just a verdict.** The output is a risk level plus *which*
  checks fired and *where* on the page — so an analyst can look at the exact
  highlighted amount in seconds instead of re-reading the whole statement.

That last point changed adoption more than any accuracy gain. A score asks for
trust. Highlighted evidence earns it.

## What it changed

Across more than **1.5 million documents** analysed while building and tuning the
engine, the biggest win wasn't catching more fraud in absolute terms — it was
**cutting false positives** to the point where a flag *meant* something. When the
system raises its hand, a human now takes it seriously, and the genuine applicants
— the overwhelming majority — move through without friction.

For a lender, that's the whole game: stop the forged ₹83,000 salary credit before
disbursement, without making ten thousand honest borrowers wait for a manual check.

## What I'd tell anyone building something similar

- **Read the file, not the render.** Pixels are what the fraudster controls. The
  file structure is what they forget about.
- **Model "normal" per source.** Fraud is a deviation; you can't measure deviation
  without a baseline for each issuer.
- **Precision is a product feature.** Every false alarm spends trust you'll need
  for the true one.
- **Explain every flag.** If an analyst can't see *why* in ten seconds, the system
  isn't finished.

Fraudsters will keep getting better tools. The good news is that every tool that
edits a PDF still has to write a PDF — and the format, quietly, remembers.
