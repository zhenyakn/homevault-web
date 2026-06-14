import { screenLoadsScenario } from "../../support/scenarios";

// Settings opens on its default "Household" section (Property & Purchase moved
// to the Portfolio page) — there is no standalone "Settings" heading on the page
// itself (only in the nav/breadcrumb).
screenLoadsScenario({
  name: "settings",
  route: "/settings",
  heading: /Household/i,
});
