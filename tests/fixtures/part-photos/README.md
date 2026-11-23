# Part-photo test set (P8-12)

The acceptance target is: **a photo of a common part returns the right part
type at least 80% of the time**. This folder is the test set.

1. Take your own photos of real parts. Old parts in a garage are perfect:
   one part per photo, in normal workshop light, from a phone. Don't use
   photos copied from websites.
2. Name each file as in `manifest.json` (e.g. `front-brake-pads-1.jpg`), or
   add your own entries. `expect` must be a slug from
   `lib/parts-catalog/seed.ts`. Optional: `note` (what a driver would type)
   and `vehicle` ("2014 Toyota Corolla").
3. Run `npx tsx scripts/eval-part-photos.ts` (needs `ANTHROPIC_API_KEY` in
   `.env.local`). Missing photos are skipped. It prints each result and the
   top-1 accuracy, and exits with an error below 80%.

Aim for 30+ photos across categories, including a few hard ones (dirty,
partly hidden, unusual angle). In production, Admin → AI usage shows the live
figure: how often the top suggestion was the part people confirmed.
