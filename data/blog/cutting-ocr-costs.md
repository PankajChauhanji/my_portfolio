# Cutting an OCR Bill by 80% Without Changing a Single Line Downstream

*How a small preprocessing layer quietly removed four out of every five calls we
made to a cloud OCR API — and why the rest of the system never found out.*

---

It started with a message in the finance channel. Not an outage, not a bug — a
question. "Why is the vision API line item growing faster than document volume?"

That sentence is worse than any stack trace, because there's no exception to
point at. The system was working. It was just expensive in a way that scaled
badly, and at a few hundred thousand documents a month, "scales badly" stops
being an abstraction and becomes a number someone wants you to explain.

So I went and looked at how we were actually spending the money. The fix turned
out to have nothing to do with the OCR itself and everything to do with *what we
were handing the API in the first place.*

## The thing nobody tells you about per-page OCR pricing

Google Vision, Azure's Read API, AWS Textract — they price the same way, and the
pricing is honest about what it charges for. It is **per image you submit**, not
per page you happen to have.

That distinction is the whole game.

A 6-page scanned PDF, processed the obvious way, is 6 images and 6 charges. But
the API has no concept of "page." It receives an image, runs detection, returns
text and bounding boxes. If you can get those 6 pages into *one* image and send
that, you pay once and get everything back. The API is indifferent. The bill is
not.

Once you see it that way, the cost problem splits into two questions that have
nothing to do with model quality:

1. **Are we OCR-ing documents we shouldn't be touching at all?**
2. **Are we making more calls than the page count actually requires?**

Both had the same answer: yes, constantly. So I built a preprocessing layer that
sits in front of the OCR call and fixes both, without changing the shape of what
comes out the other end.

## Lever one: stop paying for text you already have

This is the unglamorous one, and it was the easiest win of the entire project.

A large slice of our "PDFs" were never scans at all. They were digitally
generated — exports, generated invoices, system-produced statements — and they
carried a perfectly good embedded text layer. We were rasterising them to images
and sending them to a vision API to *re-read text that was already sitting in the
file as text.* Paying a cloud service to OCR a document that didn't need OCR.

So the first thing the pipeline does, before any image is rendered, is ask a
cheap question: does this PDF already have an extractable text layer?

```python
def is_readable(pdf, cfg):
    """True if the leading pages already contain enough extractable words."""
    total = 0
    for page in pdf.pages[: max(1, cfg.pages_to_check)]:
        total += len(page.extract_words())
        if total >= cfg.min_words:
            return True
    return total >= cfg.min_words
```

If it passes, we skip the API completely and pull the words and their boxes
straight out of the PDF with `pdfplumber`, mapped into the exact same result
structure the OCR path produces:

```python
if config.readability.enabled and is_readable(pdf, config.readability):
    return extract_text_layer(pdf, page_indices)   # zero OCR calls, full result
```

Zero external calls. Zero cents. The downstream consumer gets back the same
`words`, the same coordinates, the same schema — it cannot tell whether the text
came from a vision model or from the PDF's own text layer. For digital documents
that's not an 80% saving, it's a 100% saving, and it's pure profit because the
local extraction is faster than the network round-trip would have been anyway.

The trick is the threshold. Too low and you'll trust a garbage text layer on a
mangled file; too high and you'll re-OCR documents that were fine. We tune
`min_words` per document type rather than globally, which matters more than it
sounds — a sparse cover page and a dense contract page have very different
"normal" word counts.

## Lever two: pack more pages into each call

This is the one that actually answered the finance question.

For the documents that *do* need OCR — real scans, photographed pages, anything
without a usable text layer — the pipeline renders each requested page to an
image, runs an optional cleanup pass over it, and then stitches several pages
**vertically** into a single tall image. One image, one call, many pages.

The merge itself is almost insultingly simple. The intelligence is everywhere
around it, not in it:

```python
def _concat_vertical(images):
    width  = max(im.width for im in images)
    height = sum(im.height for im in images)
    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    y = 0
    for im in images:
        canvas.paste(im, (0, y))
        y += im.height
    return canvas
```

How many pages go into one image is a single knob, `merge_count`. We run 5–6 for
most document types, which is where the math gets good:

| Strategy                | 6-page document | API calls | Reduction |
|-------------------------|-----------------|-----------|-----------|
| One call per page       | 6 pages         | 6         | —         |
| `merge_count = 6`       | 6 pages         | 1         | ~83%      |
| `merge_count = 5`       | 6 pages         | 2         | ~67%      |

Most of our volume sat in the 4–8 page range, so a merge count of 6 captured the
bulk of the savings without needing special handling for the long-tail 40-page
outliers. In production the OCR spend dropped by roughly **80–82%**, which lined
up almost exactly with the theoretical number — always reassuring, because when
reality matches the spreadsheet it usually means you understood the problem.

And accuracy didn't drop. If anything it nudged up slightly, for a reason I'll
get to.

## The hard part: making it invisible

Anyone can stitch images together. The reason most people stop there is that the
naive version quietly destroys everything downstream. Merge six pages into one
12,000-pixel image and your "page 3" is now a band of pixels somewhere in the
middle, and every field your parser expects to find "on page 3" is floating in
coordinate space with no idea which page it belongs to.

I had a hard constraint going in: **nothing downstream was allowed to change.**
Whatever consumed OCR results before should get back the same per-page structure,
as if no merging had ever happened. The whole optimisation had to be reversible
and silent.

The mechanism is a page index map. When the renderer builds a merged image, it
records exactly which source pages went into it and in what order:

```python
@dataclass
class RenderedImage:
    data: bytes
    page_indices: list[int]   # which source pages this single image covers
    width: int
    height: int
```

After the OCR response comes back for that image, the pipeline walks the map in
reverse: every bounding box gets attributed to the page whose pixel band it falls
into, and its coordinates are offset back into that page's local space. The
result is reassembled into per-page objects in precisely the structure the rest
of the stack already expects.

```python
for page, image in zip(ocr_pages, rendered):
    page.page_indices = image.page_indices   # 6 pages in, 1 call, attribution intact
```

From the outside there is no merge. Page 1 has its text, page 4 has its text,
boxes are in page-local coordinates, the schema is identical. The optimisation
lives entirely inside the preprocessing boundary, and it never leaks.

This is also the part I'm most glad I got right early: **log the page map on
every job.** When extraction misbehaves on one page out of a batch, you need to
reconstruct which merged image it landed in and what its Y-offset was. The first
time a field came back mangled and I could replay the exact merge that produced
it, that decision paid for itself.

## Two kinds of cleanup, and why they're separate

The preprocessing chain confused me at first because it actually does its work in
two different places, and conflating them is a mistake.

**Before the call**, on the image: optional grayscale, denoise, contrast,
adaptive thresholding, upscaling, cropping. All toggleable per document type.
This is purely about giving the model a cleaner picture, and it's where that
small accuracy *gain* came from — the chain was catching faint, low-contrast
scans that had been silently producing weak results before anyone merged
anything.

**After the call**, on the coordinates: orientation and skew correction. A
rotated or upside-down scan comes back from OCR with text in the wrong places, so
the pipeline looks at the dominant angle of the recognised text lines, decides
whether the page is rotated 90°/180° or merely skewed, and transposes the
bounding boxes back to upright — in coordinate space, not by re-rendering the
image. Doing it on the geometry instead of the pixels means it's cheap and it
runs on every page regardless of whether the page "looked" clean. Skipping
correction on a page that quietly needed it is far more expensive than the few
milliseconds it costs to always run.

## Things I'd tell my past self

- **`merge_count` belongs per document type, not global.** A 2-page invoice and a
  20-page contract should not share a merging strategy. It's a config value, not
  a constant, and exposing it that way meant tuning never required a deploy.
- **Cap the merged image by bytes, not just pixels.** Dense pages — small fonts,
  heavy tables — compress poorly, and a 6-page merge of dense pages can blow past
  an API's size limit that the same merge of sparse pages never would. Check the
  encoded size after compression and split the batch before sending. Switching
  the merged output to JPEG at a sane quality, instead of PNG, gave a lot of
  headroom here.
- **Keep the engine swappable.** I wrote the OCR call behind a tiny interface so
  Google, Azure, and a local Tesseract fallback are all selectable by name. That
  was an afterthought that turned into leverage the day a pricing conversation
  with a vendor went sideways.

## What this isn't

It isn't a cache. A content hash on the normalised page image will catch exact
duplicates and is worth doing, but our documents were unique enough that hit
rates were low — merging works on every document, every time, whether it's a
duplicate or not.

It isn't LLM post-processing either. That's a fine tool for *quality*, but it
reduces OCR cost by exactly zero and usually adds a new line item on top. This is
the opposite move: do more cheap local compute so you make fewer expensive remote
calls.

---

The whole thing runs as a preprocessing step in the document pipeline. The OCR
API has no idea it's there. The downstream parsers have no idea it's there. The
only system that noticed was the invoice.

That's my favourite category of engineering: the kind where the most visible
artifact is a smaller bill, and the second most visible artifact is silence.
