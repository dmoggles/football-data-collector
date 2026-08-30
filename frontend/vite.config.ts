import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawnSync } from "node:child_process";

function resolveAppVersion(): string {
  const suppliedVersion = process.env.VITE_APP_VERSION?.trim();
  if (suppliedVersion) return suppliedVersion;

  try {
    const gitDescribe = spawnSync("git", ["describe", "--tags", "--always", "--dirty"], {
      encoding: "utf8",
    });
    const gitVersion = gitDescribe.stdout.trim();
    return gitVersion || "development";
  } catch {
    return "development";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(resolveAppVersion()),
  },
  server: {
    fs: {
      allow: [".."],
    },
    proxy: {
      "/auth": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
      "/teams": "http://127.0.0.1:8000",
      "/players": "http://127.0.0.1:8000",
      "/matches": "http://127.0.0.1:8000",
      "/collection-sessions": "http://127.0.0.1:8000",
      "/match-prep": "http://127.0.0.1:8000",
      "/admin": "http://127.0.0.1:8000",
      "/clubs": "http://127.0.0.1:8000",
      "/club-logos": "http://127.0.0.1:8000",
    },
  },
});
