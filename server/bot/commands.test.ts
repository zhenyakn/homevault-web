import { describe, it, expect } from "vitest";
import { parseCommand } from "./commands";

describe("parseCommand — simple commands", () => {
  it("parses bare read commands case-insensitively", () => {
    expect(parseCommand("/overdue").type).toBe("overdue");
    expect(parseCommand("/Dashboard").type).toBe("dashboard");
    expect(parseCommand("  /UPCOMING  ").type).toBe("upcoming");
    expect(parseCommand("/start").type).toBe("start");
    expect(parseCommand("/help").type).toBe("help");
  });

  it("strips a @BotName suffix", () => {
    expect(parseCommand("/help@HomeVaultBot").type).toBe("help");
    expect(parseCommand("/overdue@HomeVaultBot extra").type).toBe("overdue");
  });
});

describe("parseCommand — link", () => {
  it("extracts the code", () => {
    expect(parseCommand("/link HV-7K2Q-9XZ")).toEqual({
      type: "link",
      code: "HV-7K2Q-9XZ",
    });
  });
  it("uses only the first token", () => {
    expect(parseCommand("/link CODE junk")).toEqual({
      type: "link",
      code: "CODE",
    });
  });
  it("is invalid without a code", () => {
    const r = parseCommand("/link");
    expect(r.type).toBe("invalid");
  });
});

describe("parseCommand — paid", () => {
  it("extracts the id", () => {
    expect(parseCommand("/paid exp-123")).toEqual({
      type: "paid",
      id: "exp-123",
    });
  });
  it("is invalid without an id", () => {
    expect(parseCommand("/paid").type).toBe("invalid");
  });
});

describe("parseCommand — addexpense", () => {
  it("parses amount and a multi-word name", () => {
    expect(parseCommand("/addexpense 100 Water bill")).toEqual({
      type: "addexpense",
      amount: 100,
      name: "Water bill",
    });
  });

  it("accepts decimals", () => {
    const r = parseCommand("/addexpense 12.5 Gas");
    expect(r).toEqual({ type: "addexpense", amount: 12.5, name: "Gas" });
  });

  it("rejects a non-numeric or non-positive amount", () => {
    expect(parseCommand("/addexpense abc Water").type).toBe("invalid");
    expect(parseCommand("/addexpense 0 Water").type).toBe("invalid");
    expect(parseCommand("/addexpense -5 Water").type).toBe("invalid");
  });

  it("requires a name", () => {
    expect(parseCommand("/addexpense 100").type).toBe("invalid");
  });
});

describe("parseCommand — addexpense currency", () => {
  it("accepts a currency-prefixed amount", () => {
    expect(parseCommand("/addexpense $100 Water bill")).toEqual({
      type: "addexpense",
      amount: 100,
      name: "Water bill",
    });
  });
  it("accepts the /expense alias", () => {
    expect(parseCommand("/expense 40 Gas")).toEqual({
      type: "addexpense",
      amount: 40,
      name: "Gas",
    });
  });
});

describe("parseCommand — fallbacks", () => {
  it("returns unknown for unrecognized commands", () => {
    expect(parseCommand("/wat")).toEqual({ type: "unknown", command: "wat" });
  });
  it("returns unknown for empty input", () => {
    expect(parseCommand("   ").type).toBe("unknown");
  });
});

describe("natural language — log an expense without a slash", () => {
  it("parses 'spent <amount> on <name>'", () => {
    expect(parseCommand("spent 50 on groceries")).toEqual({
      type: "addexpense",
      amount: 50,
      name: "groceries",
    });
  });

  it("parses 'add expense <amount> <name>'", () => {
    expect(parseCommand("add expense 100 water bill")).toEqual({
      type: "addexpense",
      amount: 100,
      name: "water bill",
    });
  });

  it("parses a bare '<amount> <name>'", () => {
    expect(parseCommand("100 water bill")).toEqual({
      type: "addexpense",
      amount: 100,
      name: "water bill",
    });
  });

  it("parses 'paid <amount> for <name>' as an expense (amount, not an id)", () => {
    expect(parseCommand("paid 30 for gas")).toEqual({
      type: "addexpense",
      amount: 30,
      name: "gas",
    });
  });

  it("handles currency symbols and decimals", () => {
    expect(parseCommand("bought coffee $4.50")).toEqual({
      type: "addexpense",
      amount: 4.5,
      name: "coffee",
    });
    expect(parseCommand("12,5 gas")).toEqual({
      type: "addexpense",
      amount: 12.5,
      name: "gas",
    });
  });

  it("parses Russian phrasing", () => {
    expect(parseCommand("потратил 50 на продукты")).toEqual({
      type: "addexpense",
      amount: 50,
      name: "продукты",
    });
  });

  it("parses Hebrew phrasing", () => {
    expect(parseCommand("שילמתי 80 על חשמל")).toEqual({
      type: "addexpense",
      amount: 80,
      name: "חשמל",
    });
  });

  it("is invalid when a verb signals an expense but no name is given", () => {
    expect(parseCommand("spent 50").type).toBe("invalid");
  });
});

describe("natural language — mark an expense paid", () => {
  it("parses 'paid <id>' with a non-numeric id", () => {
    expect(parseCommand("paid exp-7")).toEqual({ type: "paid", id: "exp-7" });
  });
  it("parses 'mark <id> as paid'", () => {
    expect(parseCommand("mark exp-12 as paid")).toEqual({
      type: "paid",
      id: "exp-12",
    });
  });
  it("parses '<id> is paid'", () => {
    expect(parseCommand("exp-9 is paid")).toEqual({
      type: "paid",
      id: "exp-9",
    });
  });
  it("does not treat plain words as an id", () => {
    // "what is paid" must not be mistaken for marking an id paid.
    expect(parseCommand("what is paid").type).not.toBe("paid");
  });
});

describe("natural language — read intents", () => {
  it.each([
    ["what's overdue?", "overdue"],
    ["anything that needs attention", "overdue"],
    ["что просрочено?", "overdue"],
    ["how's this month going", "dashboard"],
    ["give me a summary", "dashboard"],
    ["сколько я потратил", "dashboard"],
    ["what's upcoming", "upcoming"],
    ["show me the calendar", "upcoming"],
    ["what can you do", "help"],
    ["help", "help"],
  ])("maps %j to %s", (input, expected) => {
    expect(parseCommand(input).type).toBe(expected);
  });

  it("prefers an expense when an amount is present", () => {
    // Even with words around it, a money amount means 'log an expense'.
    expect(parseCommand("add 25 for the calendar wall planner").type).toBe(
      "addexpense"
    );
  });
});

describe("natural language — fallback", () => {
  it("returns unknown (carrying the text) for unrecognized chatter", () => {
    expect(parseCommand("hello there")).toEqual({
      type: "unknown",
      command: "hello there",
    });
  });
});
