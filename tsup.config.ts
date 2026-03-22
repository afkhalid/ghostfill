import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/server.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
  },
  {
    entry: ["src/mcp.ts"],
    format: ["esm"],
    target: "node18",
    dts: true,
    sourcemap: true,
    clean: false,
    minify: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
