import { screenLoadsScenario } from "../../support/scenarios";

// Settings opens on its default "Property" section — there is no standalone
// "Settings" heading on the page itself (only in the nav/breadcrumb).
screenLoadsScenario({ name: "settings", route: "/settings", heading: /Property/i });
