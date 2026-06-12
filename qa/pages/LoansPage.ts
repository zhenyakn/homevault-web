import { BasePage } from "./BasePage";

export interface LoanInput {
  lender: string;
  amount: string;
  type?: string; // loanType label, e.g. "Personal"
  interestRate?: string;
}

/** Loans screen: create / edit / delete / add-repayment. Edit icon is square-pen. */
export class LoansPage extends BasePage {
  protected readonly route = "/loans";

  private openCreate() {
    return this.page.getByRole("button", { name: /Add loan/i }).first().click();
  }

  async addLoan(input: LoanInput): Promise<void> {
    await this.openCreate();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Lender/i, input.lender);
    await this.fillInDialog(/Total amount/i, input.amount);
    if (input.type) await this.selectInDialog(input.type, 0);
    if (input.interestRate) await this.fillInDialog(/Interest rate/i, input.interestRate);
    await this.submitDialog(/Save loan/i);
    await this.app.expectDialogOpen(false);
  }

  async editLoan(lender: string, changes: { interestRate?: string }): Promise<void> {
    await this.app.clickRowIcon(lender, "lucide-square-pen");
    await this.app.expectDialogOpen();
    if (changes.interestRate) await this.fillInDialog(/Interest rate/i, changes.interestRate);
    await this.submitDialog(/Update loan/i);
    await this.app.expectDialogOpen(false);
  }

  async deleteLoan(lender: string): Promise<void> {
    this.app.acceptConfirm();
    await this.app.clickRowIcon(lender, "lucide-trash2");
    await this.app.settle();
  }

  async addRepayment(lender: string, amount: string): Promise<void> {
    await this.app.rowFor(lender).getByRole("button", { name: /Repay/i }).first().click();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Amount/i, amount);
    await this.submitDialog(/Add repayment/i);
    await this.app.expectDialogOpen(false);
  }

  /** Submit the create dialog with an invalid amount (≤ 0). */
  async tryCreateInvalidAmount(lender: string): Promise<void> {
    await this.openCreate();
    await this.fillInDialog(/Lender/i, lender);
    await this.fillInDialog(/Total amount/i, "0");
    await this.submitDialog(/Save loan/i);
  }
}
