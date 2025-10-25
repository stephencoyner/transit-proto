import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Read source tokens
const tokensPath = path.join(rootDir, "tokens", "colors.json");
const src = JSON.parse(fs.readFileSync(tokensPath, "utf8"));

// Helper: flatten nested object into CSS variables
const toCssVars = (obj, prefix = []) =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string"
      ? [`--${[...prefix, k].join("-")}: ${v};`]
      : toCssVars(v, [...prefix, k])
  );

// Generate CSS
const css = `:root {
  ${toCssVars(src).join("\n  ")}
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Override tokens here for dark mode if needed */
  }
}
`;

// Ensure src/styles directory exists
const stylesDir = path.join(rootDir, "src", "styles");
fs.mkdirSync(stylesDir, { recursive: true });

// Write CSS file
const cssPath = path.join(stylesDir, "tokens.css");
fs.writeFileSync(cssPath, css);

// Helper: flatten nested object for TypeScript
const flatten = (obj, prefix = []) =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = [...prefix, k];
    if (typeof v === "string") {
      acc[key.join("_")] = v;
    } else {
      Object.assign(acc, flatten(v, key));
    }
    return acc;
  }, {});

const flat = flatten(src);

// Generate TypeScript
const ts = `/* auto-generated from tokens/colors.json */
/* eslint-disable */

export const HEX = ${JSON.stringify(flat, null, 2)} as const;

export type Rgba = [number, number, number] | [number, number, number, number];

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
  if (!m) throw new Error("Bad hex: " + hex);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

export const RGBA = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToRgb(v)])
) as Record<keyof typeof HEX, Rgba>;
`;

// Ensure lib directory exists
const libDir = path.join(rootDir, "src", "lib");
fs.mkdirSync(libDir, { recursive: true });

// Write TypeScript file
const tsPath = path.join(libDir, "colors.ts");
fs.writeFileSync(tsPath, ts);

console.log("✓ Generated src/styles/tokens.css");
console.log("✓ Generated src/lib/colors.ts");

