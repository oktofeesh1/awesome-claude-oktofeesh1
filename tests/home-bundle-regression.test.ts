import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "apps/web/src");
const sourceExtensions = ["", ".tsx", ".ts", ".jsx", ".js", ".json"];

function resolveImport(fromFile: string, specifier: string) {
  let base: string | undefined;
  if (specifier.startsWith("@/")) {
    base = path.join(srcRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  }
  if (!base) return undefined;

  for (const ext of sourceExtensions) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of sourceExtensions.slice(1)) {
    const candidate = path.join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function staticImportSpecifiers(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const specifiers: string[] = [];
  const normalized = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const importPattern =
    /^\s*import\s+(?!type\b)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gm;
  const exportPattern =
    /^\s*export\s+(?!type\b)(?:\*|{[\s\S]*?})\s+from\s+["']([^"']+)["'];?/gm;

  for (const match of normalized.matchAll(importPattern)) {
    if (match[1]) specifiers.push(match[1]);
  }
  for (const match of normalized.matchAll(exportPattern)) {
    if (match[1]) specifiers.push(match[1]);
  }

  return specifiers;
}

function staticImportGraph(startFile: string) {
  const pending = [startFile];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || visited.has(filePath)) continue;
    visited.add(filePath);

    for (const specifier of staticImportSpecifiers(filePath)) {
      const resolved = resolveImport(filePath, specifier);
      if (resolved && resolved.startsWith(srcRoot)) pending.push(resolved);
    }
  }

  return [...visited].sort();
}

describe("home client bundle boundaries", () => {
  it("keeps registry data out of the static home import graph", () => {
    const graph = staticImportGraph(path.join(srcRoot, "routes/index.tsx"));
    const dataModules = graph
      .map((filePath) => path.relative(repoRoot, filePath).replaceAll(path.sep, "/"))
      .filter(
        (filePath) =>
          filePath.startsWith("apps/web/src/data/") ||
          filePath.startsWith("apps/web/src/generated/"),
      );

    expect(dataModules).toEqual([]);
  });
});
