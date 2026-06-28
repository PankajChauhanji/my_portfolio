> This is a sample post so you can see how the blog renders. Replace the text in `data/blog/cutting-ocr-costs.md` with your own - the formatting below shows what's supported.

When you process **millions of documents a month**, OCR is not a line item you can ignore. Third-party OCR is billed per page, and at scale those pages add up fast. Here's the approach that let us cut OCR spend by roughly 85% while *improving* extraction accuracy.

## 1. Only OCR what you need

Most documents have a lot of dead space. Instead of sending the whole page to OCR, we crop to the **regions of interest** first:

- Detect the table or field block
- Crop tightly around it
- Send only that region downstream

Fewer pixels means faster, cheaper, and more accurate recognition.

## 2. Cache aggressively

The same templates show up again and again. A content-addressed cache keyed on a hash of the cropped image means we never pay to OCR the same thing twice.

```python
key = hashlib.sha256(image_bytes).hexdigest()
if key in cache:
    return cache[key]
```

## 3. Let the LLM clean up, not read everything

OCR gets you raw text; an LLM is great at *structuring* it. Pushing the cleanup and classification step to a well-prompted model - rather than more OCR passes - is where the cost curve really bends.

> The cheapest OCR call is the one you never make.

That's the whole trick: **do less work, cache the rest, and reserve the expensive tools for the parts that actually need them.**
