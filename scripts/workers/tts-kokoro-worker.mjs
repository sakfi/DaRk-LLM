import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function resolveRuntimePackage(name) {
  const runtime = process.env.TTS_RUNTIME || "";
  if (runtime) {
    const pkg = path.join(runtime, "node_modules", name, "dist", "kokoro.js");
    return pathToFileUrl(pkg);
  }
  return name;
}

function pathToFileUrl(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, "/");
  return `file:///${resolved.replace(/^\/+/, "")}`;
}

async function main() {
  const payload = JSON.parse(await readStdin());
  process.env.TRANSFORMERS_CACHE = payload.cacheDir || process.env.TRANSFORMERS_CACHE || "";
  process.env.HF_HOME = payload.cacheDir || process.env.HF_HOME || "";

  const kokoro = await import(resolveRuntimePackage("kokoro-js"));
  const { KokoroTTS } = kokoro;

  const tts = await KokoroTTS.from_pretrained(payload.modelId, {
    dtype: payload.dtype || "q8",
    device: "cpu",
  });
  const audio = await tts.generate(payload.text, {
    voice: payload.voice || "af_heart",
    speed: Number(payload.speed) || 1,
  });
  await fs.mkdir(path.dirname(payload.output), { recursive: true });
  audio.save(payload.output);
  process.stdout.write(JSON.stringify({
    ok: true,
    output: payload.output,
    sampleRate: audio.sampling_rate || audio.sampleRate || 24000,
  }));
}

main().catch((err) => {
  process.stderr.write(err?.stack || err?.message || String(err));
  process.exit(1);
});
