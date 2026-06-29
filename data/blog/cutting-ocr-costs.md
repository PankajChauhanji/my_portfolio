OCR at scale is a billing problem before it's an engineering problem.

Google Vision, Azure Cognitive Services, AWS Textract — they all price the same way: per page. A scanned PDF with 6 pages costs 6 API calls. Doesn't matter if 5 of those pages are identical boilerplate you've seen ten thousand times before. Doesn't matter if the pages are half-blank. Doesn't matter if you're processing the same document type in bulk. Six pages, six calls, six charges. At a few thousand documents a month that's noise. At a few hundred thousand, it's a line item your finance team starts asking about.

We were at that second number. So I built something to fix it.

## The actual problem with per-page billing

The insight is simple once you see it: OCR APIs don't care about your pages, they care about their input units. Google Vision's DOCUMENT_TEXT_DETECTION doesn't know or care that you've handed it a single image — it just processes what it receives. If you can fit multiple pages into one image and send that, you pay for one call and get back text for all of them.

The question is whether you can do that without breaking anything downstream. That's where most people stop thinking about it, because the naïve version — just stitch images together — creates a mess. You lose page boundaries. Your response parsing breaks. Fields that were on page 3 are now somewhere in the middle of a 12,000-pixel-tall image with no clear attribution.

I didn't want to change the contract of the OCR utility for the rest of the system. Whatever consumed OCR results before should get the same structure back, per page, as if nothing changed. The merging and splitting had to be invisible.

## The utility I built

The core of the solution is a configurable image merging pipeline that sits between your documents and the OCR API. It has a few distinct responsibilities:

**Ingestion and normalisation.** Whether the input is a multi-page PDF, a folder of TIFFs, a ZIP of JPEGs, or a mixed batch — the utility normalises everything to individual page images first. PDFs are rendered at a configurable DPI (we default to 200, which is the sweet spot for Google Vision accuracy vs. file size). Other formats are read as-is or converted.

**Pre-processing.** Before anything gets merged, each page goes through a pre-processing chain. Orientation correction is non-negotiable — a sideways page in a merged image ruins recognition for everything around it. We use a fast heuristic based on text line angles for rotation detection, with a fallback to a lightweight ML model for pages with sparse text. Beyond rotation, the chain handles contrast normalisation, deskewing, and noise reduction — all configurable and all toggleable per document type.

**Merging.** This is the main cost lever. Pages are stitched vertically into a single image up to a configurable maximum height. The key parameters:

- `merge_count`: how many pages to pack per image (we run 6 for most document types)
- `max_height_px`: hard ceiling to avoid sending an image the API will reject or degrade on
- `quality`: JPEG compression level for the merged output (80 hits the right trade-off)
- `separator_px`: thin white gap between pages so the OCR model doesn't bleed text across boundaries

A page index map is generated at merge time — essentially a record of which pixel ranges in the merged image correspond to which original page. This is what makes the inverse operation possible.

**OCR call.** One API call per merged image. That's the only interaction with the external service. Everything else is local compute, which is orders of magnitude cheaper.

**Response decomposition.** The OCR response comes back with bounding box coordinates for every detected text element. The utility walks the page index map in reverse, assigns each bounding box to its original page based on its Y coordinate, and reconstructs per-page response objects in exactly the structure the downstream system expects. From the perspective of anything consuming OCR output, nothing has changed. Page 1 has its text, page 3 has its text, the bounding boxes are correctly offset back to page-local coordinates. No interface changes required anywhere else in the stack.

## What this looks like in numbers

Before: 6-page document = 6 API calls.  
After: 6-page document = 1 API call.

That's an 83% reduction just from merging. We also applied this across our most common document types and found that most of our volume came from documents with 4–8 pages, so `merge_count: 6` captures the bulk of the savings without needing to handle edge cases for very long documents differently.

The actual reduction we hit in production was around 80–82% on OCR API spend, which matched the theoretical number closely. No degradation in extraction accuracy — if anything, accuracy on edge cases improved slightly because the pre-processing chain was catching orientation issues that had previously been silently failing.

## The configuration that matters in production

A few things I'd do differently if starting fresh, and a few things I'm glad I did right the first time:

**Make merge_count per document type, not global.** A 2-page invoice and a 20-page contract should not have the same merging strategy. We expose this as a document-type config so it can be tuned without code changes.

**Log the page map, always.** When something goes wrong with extraction on page 4, you need to be able to reconstruct exactly which merged image it landed in and what the Y-offset was. We write this to structured logs on every job. Saved me more than once.

**Cap merged image size by bytes, not just pixels.** Some pages are dense — lots of tables, small fonts, high information density. A 6-page merge of dense pages can hit API size limits that a 6-page merge of sparse pages won't. We do a byte-size check after compression and split the batch if needed before sending.

**Keep the pre-processing chain idempotent.** Orientation correction and deskew run on every page regardless of whether the document looks clean. The overhead is small and the alternative — silently skipping correction on a page that needed it — is worse than the compute cost.

## What this isn't

It's not a caching layer. Caching is a separate concern and worth doing — a content hash on the normalised page image before merging catches exact duplicates — but it's not what drove the savings here. Most of our documents are unique enough that cache hit rates were low. The merging approach works on every document, every time.

It's also not prompt engineering or LLM post-processing. Those are legitimate tools for improving extraction quality but they don't reduce OCR cost — they often add LLM cost on top. This is purely about reducing the number of external API calls by doing more work locally before you make them.

The whole thing is about 900 lines of Python, thoroughly configurable, and runs as a preprocessing step in our document pipeline. The OCR API has no idea it's happening. Your downstream has no idea it's happening. Your finance team just sees the bill get smaller.

That's the kind of engineering I like: invisible to everyone except the invoice.