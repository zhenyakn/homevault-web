import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getPaperlessDocumentUrl,
  getPaperlessHealth,
  listPaperlessDocuments,
} from "./paperlessClient";

export const paperlessRouter = router({
  health: protectedProcedure.query(async () => {
    return await getPaperlessHealth();
  }),

  list: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input }) => {
      const data = await listPaperlessDocuments({
        query: input?.query,
        page: input?.page,
        pageSize: input?.pageSize,
      });

      return {
        ...data,
        results: data.results.map((document) => ({
          ...document,
          url: getPaperlessDocumentUrl(document.id),
        })),
      };
    }),
});
