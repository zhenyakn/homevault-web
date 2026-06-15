# Inline overflow probe (for a dialog/state you opened by hand)

When `probe-overflow.mjs` can't reach a dialog/sub-screen automatically, copy
`shoot.mjs` (or write a tiny script), navigate + open the thing yourself, then
drop this `page.evaluate` in to print overflow within the dialog. An empty
array = no horizontal overflow; anything listed is a real clipping bug.

```js
const overflow = await page.evaluate(() => {
  const root = document.querySelector('[data-slot="dialog-content"]') || document.body;
  // Also useful: compare the dialog box vs the viewport.
  const dc = document.querySelector('[data-slot="dialog-content"]');
  const meta = dc
    ? { dialogW: dc.clientWidth, dialogScrollW: dc.scrollWidth, viewport: window.innerWidth }
    : { viewport: window.innerWidth };
  const offenders = Array.from(root.querySelectorAll("*"))
    .filter((el) => {
      const cls = el.className?.toString?.() || "";
      return el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && !cls.includes("sr-only");
    })
    .map((el) => ({
      tag: el.tagName,
      cls: (el.className?.toString?.() || "").slice(0, 70),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    }));
  return { meta, offenders };
});
console.log(JSON.stringify(overflow, null, 2));
```

To see *which* elements are pushed off-screen (the visible symptom), list
descendants with `getBoundingClientRect().left < 0` or `.right >
window.innerWidth` — those are the ones clipping at the edges.
