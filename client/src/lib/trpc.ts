import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter, RouterOutputs, RouterInputs } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();
export type { RouterOutputs, RouterInputs };
