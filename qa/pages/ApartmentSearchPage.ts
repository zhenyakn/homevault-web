import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export interface SearchInput {
  name: string;
  type?: "Rent" | "Buy";
  budget?: string;
}

export interface CandidateInput {
  title: string;
  /** Monthly rent (rent search) or asking price (buy search), major units. */
  price?: string;
  rooms?: string;
}

/**
 * Apartment Search (hunting mode): the search list, a search's candidate list,
 * and the candidate detail page. The dialogs use bare <Label>s with no
 * htmlFor, so fields are targeted by placeholder / position (see BasePage).
 */
export class ApartmentSearchPage extends BasePage {
  protected readonly route = "/apartment-search";

  /** Create a search; the app then navigates into the new search's detail. */
  async createSearch(input: SearchInput): Promise<void> {
    await this.page
      .getByRole("button", { name: /New search/i })
      .first()
      .click();
    await this.app.expectDialogOpen();
    await this.fillByPlaceholderInDialog(/near the office/i, input.name);
    if (input.type) await this.selectInDialog(input.type, 0);
    if (input.budget) await this.fillDialogNumber(0, input.budget);
    await this.submitDialog(/Create/i);
    await this.app.expectDialogOpen(false);
  }

  /** From a search's candidate list, add a candidate via the header action. */
  async addCandidate(input: CandidateInput): Promise<void> {
    await this.page
      .getByRole("button", { name: /Add candidate/i })
      .first()
      .click();
    await this.app.expectDialogOpen();
    await this.fillByPlaceholderInDialog(/Rothschild Blvd/i, input.title);
    if (input.price) await this.fillDialogNumber(0, input.price);
    // Submit button inside the dialog is labelled "Add candidate".
    await this.dialog()
      .getByRole("button", { name: /Add candidate/i })
      .first()
      .click();
    await this.app.settle();
    await this.app.expectDialogOpen(false);
  }

  /** Open a candidate's detail page from the list by its title. */
  async openCandidate(title: string): Promise<void> {
    await this.app.rowFor(title).first().click();
    await this.app.settle();
  }

  /** Click a stage chip in the candidate detail stepper (e.g. "Viewed"). */
  async advanceStage(stageLabel: string | RegExp): Promise<void> {
    await this.page.getByRole("button", { name: stageLabel }).first().click();
    await this.app.settle();
  }

  /** Convert the open candidate into a real property. */
  async convertToProperty(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Make this my home/i })
      .first()
      .click();
    await this.app.settle();
  }

  async expectStage(stageLabel: string | RegExp): Promise<void> {
    await expect(this.page.getByText(stageLabel).first()).toBeVisible();
  }
}
