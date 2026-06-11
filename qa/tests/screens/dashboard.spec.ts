import { screenLoadsScenario } from "../../support/scenarios";

// The dashboard ("/") has no fixed title text, so we only assert it renders
// some heading and doesn't hit the error boundary.
screenLoadsScenario({ name: "dashboard", route: "/", heading: /.+/ });
