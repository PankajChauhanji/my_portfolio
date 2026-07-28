# Cutting an OCR Bill by 80% — and the Compute Behind It — Without Changing a Single Line Downstream

*An OCR request costs you twice: once to the vendor for the call, and once to your
own machines for the work of producing it. I went after both — page merging to
collapse the calls, and a streamed, bounded pipeline to flatten the RAM, CPU, and
latency underneath them — and the rest of the system never found out.*

---

It started with a message in the finance channel. Not an outage, not a bug — a
question. "Why is the vision API line item growing faster than document volume?"

That sentence is worse than any stack trace, because there's no exception to
point at. The system was working. It was just expensive in a way that scaled
badly, and at a few hundred thousand documents a month, "scales badly" stops
being an abstraction and becomes a number someone wants you to explain.

But there was a second number, and it was the one I could see in our own
dashboards long before finance saw theirs: the render-and-prep workers were
heavy. Rasterising pages, cleaning them, encoding them — that's real CPU and real
RAM, and it grew with every page of every document, whether we ever needed to
look at that page or not. The API invoice was the visible cost. The compute to
feed the API was the invisible one, and they were both climbing.

So I stopped thinking about "the OCR bill" and started thinking about the **total
cost of an OCR request** — vendor plus infrastructure — and went after it on two
fronts at once.

## The thing nobody tells you about per-page OCR pricing

Google Vision, Azure's Read API, AWS Textract — they price the same way, and the
pricing is honest about what it charges for. It is **per image you submit**, not
per page you happen to have.

That distinction is the whole game for the first front.

A 6-page scanned PDF, processed the obvious way, is 6 images and 6 charges. But
the API has no concept of "page." It receives an image, runs detection, returns
text and bounding boxes. If you can get those 6 pages into *one* image and send
that, you pay once and get everything back. The API is indifferent. The bill is
not.

And notice what else those 6 separate images were: 6 renders, 6 cleanup passes, 6
encodes, 6 network round-trips. The naive approach was expensive on *both* fronts
simultaneously. Which is exactly why fixing it on both was so satisfying — the two
levers pull in the same direction.

## An OCR request costs you twice

Before any of the levers, the framing:

- **The remote cost** is the vendor invoice, and it's driven by **how many calls
  you make.** That's the merging story — front one.
- **The local cost** is the CPU, RAM, and wall-clock time your own workers burn
  rendering and preparing the images those calls are made of. That's the resource
  story — front two.

Most write-ups stop at the first and quietly let the second balloon. But if
merging halves your invoice while doubling your compute footprint, you haven't cut
cost — you've moved it to a different budget line. The win only counts when both
go down. So they had to be designed together.

---

## Front one — fewer calls: page merging

### The cheapest call is the one you never make

Before merging anything, the pipeline asks a cheap question: does this PDF already
have an extractable text layer? A large slice of our "PDFs" were never scans —
they were digitally generated exports and statements carrying perfectly good
embedded text. We were rasterising them to images and paying a cloud service to
*re-read text that was already in the file.*

```python
def is_readable(pdf, cfg):
    """True if the leading pages already contain enough extractable words."""
    total = 0
    for page in pdf.pages[: max(1, cfg.pages_to_check)]:
        total += len(page.extract_words())
        page.flush_cache()
        if total >= cfg.min_words:
            return True
    return total >= cfg.min_words
```

If it passes, we skip the API entirely and pull the words and boxes straight out
of the PDF with `pdfplumber`, mapped into the same result structure the OCR path
produces. Zero calls, zero cents — and, because there's no render step either,
zero compute too. It's the one place both fronts hit 100% at once.

### Packing pages into one image

For documents that genuinely need OCR, the pipeline renders each requested page,
runs an optional cleanup pass, and stitches several pages **vertically** into one
tall image. One image, one call, many pages. The merge itself is almost insultingly
simple — the intelligence is everywhere around it, not in it:

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
bulk of the savings without special-casing the long-tail 40-page outliers. In
production the OCR spend dropped by roughly **80–82%**, lining up almost exactly
with the theoretical number — always reassuring, because when reality matches the
spreadsheet it usually means you understood the problem. Accuracy didn't drop; if
anything it nudged up, for a reason I'll get to.

Fewer calls also means fewer network round-trips, so merging quietly paid a
dividend on the *second* front too: latency. Six sequential HTTP exchanges become
one. That overlap between the two fronts is the whole theme of this piece.

### The hard part: making the merge invisible

Anyone can stitch images together. The naive version quietly destroys everything
downstream. Merge six pages into one 12,000-pixel image and "page 3" is now a band
of pixels somewhere in the middle, and every field your parser expects "on page 3"
is floating in coordinate space with no idea which page it belongs to.

I had a hard constraint: **nothing downstream was allowed to change.** So the
renderer records exactly which source pages went into each merged image, in what
order, and at what vertical offset:

```python
@dataclass
class RenderedImage:
    data: bytes
    page_indices: list[int]   # which source pages this single image covers
    width: int
    height: int
    pages_meta: list[dict]    # per-page width/height/y_offset — enough to slice back out
```

After the response comes back, the pipeline walks the map in reverse: every
bounding box is attributed to the page whose pixel band it lands in, and its
coordinates are offset back into that page's local space, then reassembled into
per-page objects in precisely the structure the rest of the stack expects.

```python
for page, image in zip(ocr_pages, rendered):
    page.page_indices = image.page_indices   # 6 pages in, 1 call, attribution intact
```

From the outside there is no merge. And because the result can serialise itself
back into the old service's exact JSON shape — `to_legacy_dict()` — the existing
consumers didn't just keep working, they didn't need a single edit. The
optimisation lives entirely inside the preprocessing boundary and never leaks.

The thing I'm most glad I got right early: **record the page map on every job.**
The first time a field came back mangled and I could replay the exact merge and
Y-offset that produced it, that decision paid for itself.

---

## Front two — cheaper calls: RAM, CPU, and latency

Merging shrinks the invoice. But every surviving call is still made of rendered,
cleaned, encoded images, and that work runs on machines you pay for. If those
machines need more RAM and more cores as documents get bigger, you've just traded
a vendor bill for an infrastructure bill. So the second front is about making each
call *cheap to produce* — and, ideally, cheap in a way that doesn't grow with
document size at all.

### Flat memory, at any document size

The trap in "just merge the pages" is the obvious implementation: render the whole
document to images, hold them all, stitch, send. Fine for a 6-page invoice. A way
to get paged out of existence on a 400-page contract — and those big documents
were exactly the ones making the bill scary in the first place.

So the pipeline never holds the document. It works on a **bounded window** of it.
Pages are rendered, cleaned, encoded, and freed in batches sized to the merge and
the worker pool; the instant an image becomes bytes it's released, and the
per-page PDF caches are flushed as we go. Only the final result grows with length
— never the working set.

The payoff is a memory profile that's essentially a flat line whether you feed it
2 pages or 200. That's the difference between "runs on a big box if you're lucky"
and "runs on the same modest worker for every document we own."

### Concurrency for latency

The surviving calls run through a bounded thread pool — `max_workers`
simultaneous requests in flight, order preserved on the way out. That same number
doubles as the render/OCR batch size, so it's a single dial that trades peak RAM
against wall-clock latency: turn it up on a fat host to finish sooner, turn it
down on a tight one to stay inside its memory budget. Merging cut the *number* of
round-trips; concurrency cut the time the *remaining* ones spend waiting on each
other.

### CPU you're spending for nothing

Two of the biggest compute wins were simply *not doing work that bought nothing.*

- **Render resolution is quadratic.** Memory and CPU scale with the square of
  `ppi`, so 400 dpi isn't 33% more expensive than 300 — it's ~78% more, for
  accuracy that's often indistinguishable. Pinning the sweet spot at 300 was one
  of the largest single CPU savings, and it was a one-line default.
- **The denoiser that cost 20× for identical output.** The table-line detector had
  an NLMeans denoise pass in front of it. When I actually measured it, it was
  burning roughly **20× the CPU** — on the order of extra seconds per page — and
  producing *byte-identical* line output on both clean and noisy scans, because the
  morphological step downstream already suppressed the noise. It's now off by
  default. Measuring the thing you assumed you needed is the highest-leverage habit
  I have.

### Stop hauling back payload you'll never read

The last resource lever is on the wire and in storage, not the CPU. A Google
Vision response carries both `textAnnotations` (words + boxes) and
`fullTextAnnotation` (a per-*symbol* tree describing every character). We needed
words. We were paying — in bandwidth, parse time, and stored blob size — to move a
per-character tree nothing ever read. So the engine drops it by default and keeps
only the word-level view, one flag away for the rare caller who wants everything:

```python
if not self.char_level:                     # default: word-level only
    body = self._strip_char_level(body)     # drop the per-symbol subtree
```

None of these touch the model or the schema. They're all the same discipline as
front one, pointed inward: what you compute, what you keep in memory, and what you
bother to bring back.

---

## Why the two fronts multiply

Kept separate, each front is a decent optimisation. Together they compound, because
they act on different factors of the same total.

- Merging cut calls by **~80%** → the vendor invoice fell by the same.
- The resource work made each surviving call **flat in RAM, lighter in CPU, and
  faster in wall-clock** → the fleet that produces those calls got smaller and
  cheaper *per call*.

Fewer calls, each cheaper to make. You're not adding two savings, you're
multiplying a smaller count by a smaller unit cost — which is why the finance line
and the infra line both bent down at once, and why the system could be pointed at
a 500-page document without anyone flinching.

## Two kinds of cleanup, and why they're separate

Worth a note because it confused me at first: the preprocessing does its work in
two different places.

**Before the call**, on the image: grayscale, denoise, contrast, adaptive
thresholding, upscaling, cropping — all toggleable per document type. Purely about
handing the model a cleaner picture, and where that small accuracy *gain* came
from: it was catching faint, low-contrast scans that had been silently producing
weak results.

**After the call**, on the coordinates: orientation and skew correction, done on
the bounding-box geometry rather than by re-rendering pixels. That choice is itself
a resource decision — correcting geometry is a few milliseconds; re-rendering a
page is not — so it's cheap enough to run on every page instead of guessing which
ones "look" rotated.

## Things I'd tell my past self

- **`merge_count` belongs per document type, not global.** A 2-page invoice and a
  20-page contract shouldn't share a strategy. It's a config value; exposing it
  that way meant tuning never required a deploy.
- **Cap the merged image by bytes, not just pixels.** Dense pages compress poorly,
  and a 6-page merge of them can blow past an API's size limit that the same merge
  of sparse pages never would. Check the encoded size and split before sending;
  switching the merged output to JPEG at a sane quality bought a lot of headroom.
- **A `200 OK` is not the same as a success.** Vision's batch endpoint can return a
  healthy HTTP 200 whose body carries a *per-image* error — a transient, retryable
  blip on one image in the batch. Undetected, it looks exactly like a successful
  response with zero words, so you cache it as "done" and never retry. Cracking the
  batch body open and raising on those quietly recovered a slice of documents that
  had been coming back silently empty.
- **Measure the expensive step before you trust it.** The 20×-CPU denoiser survived
  in the codebase for a long time purely because nobody had timed it against its own
  output. Assumptions about cost are worth exactly what an actual measurement says.
- **Keep the engine swappable — for real.** The OCR call sits behind a two-method
  interface: `call()` returns the vendor's raw response, `parse()` maps it into one
  shared schema. Google, Azure, and a local Tesseract fallback are selectable by
  name; adding a fourth never touches the pipeline. An afterthought that became
  leverage the day a vendor pricing conversation went sideways.

## What this isn't

It isn't a cache. A content hash catches exact duplicates and is worth doing, but
our documents were unique enough that hit rates were low — merging works on every
document, every time. And it isn't LLM post-processing: that's a tool for
*quality*, it reduces OCR cost by exactly zero, and it usually adds a line item.
This is the opposite move — more cheap local compute so you make fewer, lighter,
expensive remote calls.

## What it turned into

The two-front cost fix was the seed; what grew out of it is what I reach for now —
a single, self-documenting OCR toolkit where every hard-won lesson is a switch you
flip, not code you rewrite.

- **One API, any backend** — Google, Tesseract (fully local, no key), Azure, or a
  mock engine, behind one interface and one output schema.
- **Constant memory at any size** — the streamed, bounded-window design, verified
  flat from 2 to 100+ pages.
- **Cost controls as config** — page merging, the readable-PDF shortcut, and
  word-level-only payloads, each a single knob.
- **Resource controls as config** — `max_workers` and `ppi` as explicit dials on
  the RAM/CPU/latency trade, with the costly stages (denoise) off by default.
- **Two output modes plus legacy compatibility** — raw vendor response, a
  normalised engine-agnostic schema, or the old service's exact JSON via one call.
- **Optional, off-by-default stages** — table-cell extraction, ruling-line
  detection, orientation/skew correction, image cleanup, cropping. Mention one to
  turn it on; unknown settings raise instead of failing silently.
- **Self-documenting** — `import ocr_kit; ocr_kit.help()` prints the whole guide.

Every bullet there is a scar from the cost project wearing a nicer shirt.

---

The whole thing runs as a preprocessing step in the document pipeline. The OCR API
has no idea it's there. The downstream parsers have no idea it's there. Two things
noticed: the invoice, and the graph of memory-per-document going flat.

That's my favourite category of engineering: the kind where the most visible
artifacts are a smaller bill and a calmer dashboard — and the third most visible
artifact is silence.
