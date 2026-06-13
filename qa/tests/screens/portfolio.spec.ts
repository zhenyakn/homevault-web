import { screenLoadsScenario } from "../../support/scenarios";

// Reachable by deep link even with a single property (the sidebar entry only
// appears with 2+).
screenLoadsScenario({
  name: "portfolio",
  route: "/portfolio",
  heading: /^Portfolio$/,
});
