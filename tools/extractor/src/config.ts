import { z } from "zod";
export const extractorConfigSchema = z.object({
  executablePath: z.string().min(1),
  gameDataPath: z.string().min(1),
  outputPath: z.string().min(1),
  version: z.string().min(1),
});
export type ExtractorConfig = z.infer<typeof extractorConfigSchema>;
export function readExtractorConfig(environment: NodeJS.ProcessEnv): ExtractorConfig {
  return extractorConfigSchema.parse({
    executablePath: environment.GBFR_DATA_TOOLS_PATH,
    gameDataPath: environment.GBFR_GAME_DATA_PATH,
    outputPath: environment.RELINK_RAW_OUTPUT_PATH,
    version: environment.GBFR_DATA_TOOLS_VERSION,
  });
}
