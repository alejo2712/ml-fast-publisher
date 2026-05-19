# Mercado Libre — Product Image Requirements

## Summary for this app

Images embedded in the Excel file are automatically:
1. Extracted from the XLSX drawing layer on upload
2. Uploaded to ML's `/pictures/items/upload` endpoint when you click **Preparar publicación**
3. Replaced with `https://http2.mlstatic.com/...` CDN URLs in the final payload

You do not need to upload separate PNG files when using the embedded-image Excel format.

---

## ML Image Requirements

### Dimensions

| Requirement | Value |
|-------------|-------|
| Minimum size | **500 × 500 px** (ML rejects smaller) |
| Recommended size | **1200 × 1200 px** (used for zoom) |
| Aspect ratio | Square (1:1) recommended; rectangular accepted |
| Maximum file size | **5 MB** per image |

Images smaller than 500×500 px will be rejected by ML's `/pictures/items/upload` endpoint.

### Formats

| Format | Accepted |
|--------|----------|
| JPEG / JPG | ✓ (recommended, smallest file size) |
| PNG | ✓ |
| WebP | ✓ |
| GIF | ✓ (static only recommended) |
| BMP, TIFF | ✗ Not accepted |

### Content Guidelines

- **White background** — ML strongly recommends a clean white background (#FFFFFF)
- **Product centered** — product must occupy at least 50–80% of the frame
- **Forward-facing / front view** — primary image must show the product from the front
- **Well-lit** — no harsh shadows; even, diffuse lighting preferred
- **No logos or watermarks** — do not add brand overlays, watermarks, or text on top of the product
- **No decorative borders** — no frames, no lifestyle contexts in the primary image
- **No people** in the primary image (secondary images can show the product in use)
- **No collages** in the primary image (each image must show a single product view)

### ML CDN Upload Endpoint

```
POST https://api.mercadolibre.com/pictures/items/upload
Authorization: Bearer {access_token}
Content-Type: multipart/form-data
Field name: file
```

**Response:**
```json
{
  "id": "...",
  "url": "http://...",
  "secure_url": "https://http2.mlstatic.com/D_NQ_NP_..."
}
```

Use `secure_url` in listing payloads. ML requires HTTPS URLs for all listing images.

**Error response (image rejected):**
```json
{
  "message": "The image is invalid",
  "error": "invalid_image",
  "status": 400,
  "cause": [{ "message": "...", "code": 1000 }]
}
```

### Using Pictures in a Listing Payload

```json
"pictures": [
  { "source": "https://http2.mlstatic.com/D_NQ_NP_..." },
  { "source": "https://http2.mlstatic.com/D_NQ_NP_..." }
]
```

- At least **1 image** is required to publish
- Maximum **6 images** recommended (ML may accept up to 12)
- First image becomes the thumbnail shown in search results
- All sources must be `https://` — ML rejects `http://`, local paths, or blob URLs

---

## Image Restrictions

These patterns are **not** accepted as listing images:

| Pattern | Why blocked |
|---------|-------------|
| `__emb__row1img0.png` | Synthetic filename — must be uploaded to ML CDN first |
| `/uploads/photo.jpg` | Local server path — not publicly accessible |
| `blob:http://...` | Browser blob URL — not publicly accessible |
| `http://...` | HTTP (not HTTPS) — ML requires HTTPS |
| `https://cdn.example.com/photo.jpg` | External HTTPS ✓ allowed without upload |
| `https://http2.mlstatic.com/...` | ML CDN URL ✓ already uploaded |

---

## Excel Embedded Image Flow (this app)

When you embed images directly in the Excel file (Insert → Pictures in Excel):

1. **Upload Excel** → app extracts images from `xl/media/` and `xl/drawings/`
2. **Parse rows** → each row's draft gets synthetic `__emb__row{N}img{M}.png` filenames
3. **"Preparar publicación"** → app uploads all embedded images to ML CDN via `/pictures/items/upload`
4. **CDN URLs** → `__emb__` filenames replaced with `https://http2.mlstatic.com/...` URLs
5. **Publish** → final payload uses only ML CDN HTTPS URLs ✓

If any upload fails, prepare is blocked and the exact ML error is shown per image.

### Excel image size recommendation

Embed images at **1200×1200 px** in the Excel file. Images should be:
- JPEG for photographs (smaller file = faster upload)
- PNG for product renders / white background cutouts
- Maximum ~300 KB per embedded image to keep the Excel file manageable

---

## Test Images

The test fixture generator (`npm run gen:images`) creates 1200×1200 white PNG placeholders.
These are valid for pipeline testing but may be rejected by ML as "blank" images in production.

For production testing, replace the test images with real product photos that meet the guidelines above.
