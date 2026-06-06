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

describe("parseCommand — fallbacks", () => {
  it("returns unknown for unrecognized commands", () => {
    expect(parseCommand("/wat")).toEqual({ type: "unknown", command: "wat" });
  });
  it("returns text for non-command input", () => {
    expect(parseCommand("hello there")).toEqual({
      type: "text",
      text: "hello there",
    });
  });
  it("returns unknown for empty input", () => {
    expect(parseCommand("   ").type).toBe("unknown");
  });
});
