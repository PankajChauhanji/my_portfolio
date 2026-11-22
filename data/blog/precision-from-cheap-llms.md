# Small Models, Serious Precision: Getting 97–99% Accuracy From Cheap LLMs

*The fastest way to make an LLM pipeline accurate is to throw a bigger model at it.
The fastest way to make it unaffordable is the same. Over the last year I've shipped
extraction and classification pipelines that run on small, cheap — sometimes
self-hosted — models and still hold 97–99% precision. None of it is magic. It's a
handful of design habits.*

---

Two problems shaped this post.

The first: extracting a PAN number from Indian election affidavits — scanned
documents in every regional language, handwritten or printed, rotated, photographed
on stamp paper with notary seals across the text. A wrong PAN attached to a
politically exposed person is far worse than no PAN at all. Precision is the whole
job.

The second: classifying what a company *actually does* from its website into one of
hundreds of fine-grained industry codes — for millions of companies, which means
the cost per call matters as much as the answer.

Both ended up running on small models. Here's what made that possible.

## 1. Don't send the LLM work that code can do

The cheapest LLM call is the one you never make.

In the affidavit pipeline, a deterministic extractor runs first: OCR, find the PAN
section, generate candidates, validate them against the PAN format (five letters,
four digits, a letter — with the fourth character restricted to valid holder
types). When that path produces a clean, unambiguous answer, we're done.

On a real batch, **64% of documents never needed an LLM at all.** The model is
reserved for the genuinely hard cases: smudged digits, handwriting, a value that
wraps across two lines.

## 2. Shrink the question until a small model can't get lost

Small models fail on *big, open* questions. They're surprisingly good at *small,
closed* ones.

- **Crop, don't send the page.** For a disputed PAN, the model sees the single
  table cell, not twenty pages of affidavit.
- **Shortlist, then choose.** For industry classification, embeddings first narrow
  hundreds of codes down to a short candidate list; the LLM only picks from that
  list. Choosing among a handful of options is a task a small model does reliably —
  inventing the right code from scratch is not.

The same model that's unreliable as an oracle becomes very dependable as a judge
between a few options.

## 3. Make two independent readers agree

This one change moved affidavit precision from **92.3% to 97.1%**.

OCR-plus-rules and the LLM fail in *different* ways — one confuses `8` and `B`,
the other occasionally hallucinates a plausible digit. So when the deterministic
reader needed to "correct" a character, its answer is only accepted if an
independent LLM read of the same pixels returns exactly the same value. If they
disagree, the document goes to human review instead of the database.

Agreement between uncorrelated readers is a far better confidence signal than any
single model's self-reported confidence. And it stays cheap, because only the
ambiguous cells trigger the second read.

## 4. Give the model a way to say "I can't read this"

Most hallucinations are a model being polite — you asked for a value, so it gives
you one.

The prompt's first rule became: *if all ten characters aren't clearly legible,
return `null` and the partial text verbatim.* Then the code validates every answer
strictly and never "repairs" an invalid one. A structurally invalid PAN surfaces as
an honest partial for review; it never becomes a confident wrong record.

Pair that with a strict JSON schema and you've turned free text into a contract
your code can enforce.

## 5. Determinism is a precision feature

We chased a "precision wobble" for a while — the same document producing different
answers on different runs. The cause wasn't the model's intelligence; it was
sampling. Setting **temperature to 0** for extraction made crop re-reads
reproducible, and reproducible errors are errors you can actually fix.

## 6. Treat reasoning effort as a dial, not a default

"Thinking" tokens are expensive, and they don't help everywhere.

- For confirming that a field is genuinely *nil* ("not applicable", in any of a
  dozen scripts), reasoning off produced byte-identical results — and cut total
  cost by about 15%.
- For hard handwritten crops, turning reasoning off lost real answers, so it stays
  on there.
- And more is not always better: in a full model sweep, pushing reasoning to
  "high" made accuracy *drop* while cost jumped almost tenfold.

Measure per sub-task. The right setting is rarely the same across a pipeline.

## 7. Evaluate like you mean it

None of the above would be safe without a regression gate. A hand-labelled golden
set scores every change — prompt, threshold, model, OCR engine — on precision,
recall and an explicit list of false positives.

Two rules came out of that discipline:

- **A cost cut ships only if accuracy holds.** That's how the affidavit pipeline
  went from ₹0.257 to ₹0.144 per document (**−44%**) with no loss of precision.
- **A confidently wrong model is disqualified, however cheap.** One very small
  model failed the sweep not because it was weak on average, but because it
  *systematically* declared real values as absent. Averages hide exactly the
  failures that hurt you most.

## 8. Self-hosting closes the last gap

For the company classifier, a self-hosted open-weight model (Qwen) scored **98.2%**
against **98.7%** for a hosted API model on the same held-out set — and costs
nothing per call. Add an embedding cache (which cut shortlist time from minutes to
seconds — about **97x faster**) and a pipeline that once looked too expensive to run
across millions of companies becomes routine.

## The pattern

Look closely and every habit above is the same idea: **narrow the model's job until
precision is easy, and verify everything it says.**

- Let code handle the certain cases.
- Ask small, closed questions.
- Demand agreement from independent readers.
- Allow "I don't know".
- Measure every change against labelled truth.

Do that, and the size of the model stops being the thing that decides whether your
pipeline is accurate. Your design does.
