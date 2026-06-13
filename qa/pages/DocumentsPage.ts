import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Documents ("/documents") — the "Home file" completeness overview. It lists 9
 * fixed document categories and a coverage card. Uploading is intentionally
 * disabled in this build, so we assert the Upload control exists but is disabled
 * (a real capability edge: the button is present yet inert).
 */
export class DocumentsPage extends BasePage {
  protected readonly route = "/documents";

  async expectTitle(): Promise<void> {
    await expect(this.page.getByText(/Home Documents/i).first()).toBeVisible();
  }

  /** Every canonical category tile should render. */
  async expectCategory(name: string | RegExp): Promise<void> {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  /** The Upload affordance is present but disabled in this build. */
  async expectUploadDisabled(): Promise<void> {
    const upload = this.page.getByRole("button", { name: /Upload/i }).first();
    await expect(upload).toBeVisible();
    await expect(upload).toBeDisabled();
  }
}
