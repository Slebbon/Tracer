import { normalize } from "node:path";

export const DEFAULT_IGNORES = [
  "**/.env",
  "**/.env.*",
  "**/secrets/**",
  "**/*.pem",
  "**/*.key",
  "**/node_modules/**",
  "**/.git/**"
];

export function isIgnoredPath(filePath: string, patterns: string[] = DEFAULT_IGNORES): boolean {
  const normalized = normalize(filePath).replaceAll("\\", "/");
  const relative = normalized.replace(/^\.\//, "");
  return patterns.some((pattern) => matchesGlob(relative, pattern));
}

function matchesGlob(value: string, pattern: string): boolean {
  const normalizedPattern = pattern.replaceAll("\\", "/");
  const escaped = escapeRegex(normalizedPattern);
  const regexSource = escaped
    .replaceAll("\\*\\*/", "(?:.*/)?")
    .replaceAll("\\*\\*", ".*")
    .replaceAll("\\*", "[^/]*");
  return new RegExp(`^${regexSource}$`).test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\*]/g, "\\$&");
}
