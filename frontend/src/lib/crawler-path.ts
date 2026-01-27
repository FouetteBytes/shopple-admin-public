import path from 'path';

/**
 * Resolves the crawler workspace directory based on configuration.
 * Priority order:
 * 1. Absolute path from CRAWLER_PATH env var.
 * 2. Relative path from CRAWLER_RELATIVE_PATH env var (resolved against process.cwd()).
 * 3. Default to ../crawler relative to the frontend package root.
 */
export function resolveCrawlerPath(): string {
  const explicitPath = process.env.CRAWLER_PATH?.trim();
  if (explicitPath) {
    return path.resolve(explicitPath);
  }

  const relativePath = process.env.CRAWLER_RELATIVE_PATH?.trim();
  if (relativePath) {
    return path.resolve(process.cwd(), relativePath);
  }

  return path.resolve(process.cwd(), '..', 'crawler');
}
