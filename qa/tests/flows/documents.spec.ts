import { test } from "../../fixtures";

/**
 * Documents — the "Home file" overview. Read-only in this build: nine fixed
 * categories plus a coverage card, and an Upload button that is present but
 * deliberately disabled (a capability edge worth pinning).
 */
test.describe("Documents — categories & disabled upload", () => {
  test("lists the canonical document categories", async ({ documents }) => {
    await documents.open();
    await documents.expectTitle();
    for (const cat of [
      /Mortgage/i,
      /Insurance/i,
      /Taxes/i,
      /Utilities/i,
      /Warranties/i,
      /Receipts/i,
      /Contractors/i,
      /Renovations/i,
    ]) {
      await documents.expectCategory(cat);
    }
  });

  test("the Upload control is present but disabled", async ({ documents }) => {
    await documents.open();
    await documents.expectUploadDisabled();
  });
});
