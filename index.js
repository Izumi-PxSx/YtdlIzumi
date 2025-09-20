import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 7860;

const ytDlpPath = path.resolve("./yt-dlp");
const cookiesFile = path.resolve("./cookies.txt");
const tmpDir = path.resolve("./tmp");

// ✅ Pastikan folder tmp ada
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// ✅ Fungsi download YouTube
async function ytdl(url, quality = "720") {
  return new Promise((resolve, reject) => {
    // filename unik: title + id biar ga tabrakan
    const outputFile = path.join(tmpDir, "%(title)s-%(id)s.%(ext)s");

    const qualityMap = {
      "360": "bestvideo[height<=360]+bestaudio/best[height<=360]",
      "720": "bestvideo[height<=720]+bestaudio/best[height<=720]",
      "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
      "mp3": "bestaudio/best",
    };

    const format = qualityMap[quality] || qualityMap["720"];

    let args = [
      "--cookies", cookiesFile,
      "-f", format,
      "--add-metadata",
      "--write-info-json",
      "-o", outputFile,
      url,
    ];

    if (quality === "mp3") {
      args = [
        "--cookies", cookiesFile,
        "-f", format,
        "-x", "--audio-format", "mp3",
        "--add-metadata",
        "--write-info-json",
        "-o", outputFile,
        url,
      ];
    } else {
      args.push("--merge-output-format", "mp4");
    }

    const yt = spawn(ytDlpPath, args);

    yt.stdout.on("data", (data) => console.log(`📥 ${data}`));
    yt.stderr.on("data", (data) => console.error(`⚠️ ${data}`));

    yt.on("close", (code) => {
      if (code === 0) {
        try {
          // ambil metadata JSON
          const jsonFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith(".info.json"));
          let metaClean = {};
          if (jsonFiles.length > 0) {
            const metaPath = path.join(tmpDir, jsonFiles[0]);
            const rawMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            metaClean = {
              title: rawMeta.title || null,
              author: rawMeta.uploader || rawMeta.channel || null,
              thumbnail: rawMeta.thumbnail || (rawMeta.thumbnails?.[0]?.url ?? null),
              url: rawMeta.webpage_url || url,
              videoId: rawMeta.id || null,
              duration: rawMeta.duration || null,
              uploadDate: rawMeta.upload_date || null,
              description: rawMeta.description || null,
              viewCount: rawMeta.view_count || null,
              likeCount: rawMeta.like_count || null,
            };
          }

          const ext = quality === "mp3" ? ".mp3" : ".mp4";
          const mediaFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith(ext));
          if (mediaFiles.length === 0) return reject("❌ File tidak ditemukan");
          const mediaPath = path.join(tmpDir, mediaFiles[0]);

          resolve({ file: mediaPath, metadata: metaClean });
        } catch (err) {
          reject("❌ Gagal parsing metadata: " + err.message);
        }
      } else {
        reject(`❌ Error, kode keluar: ${code}`);
      }
    });
  });
}

// ✅ Endpoint ytmp3
app.get("/ytmp3", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Parameter url wajib diisi" });

  try {
    const result = await ytdl(url, "mp3");
    res.json({
      status: "success",
      type: "mp3",
      file: result.file,
      metadata: result.metadata,
      download: `https://izukumii-ytdl.hf.space/download?file=${encodeURIComponent(path.basename(result.file))}`,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.toString() });
  }
});

// ✅ Endpoint ytmp4
app.get("/ytmp4", async (req, res) => {
  const { url, format } = req.query;
  if (!url) return res.status(400).json({ error: "Parameter url wajib diisi" });

  try {
    const result = await ytdl(url, format || "720");
    res.json({
      status: "success",
      type: "mp4",
      file: result.file,
      metadata: result.metadata,
      download: `https://izukumii-ytdl.hf.space/download?file=${encodeURIComponent(path.basename(result.file))}`,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.toString() });
  }
});

// ✅ Endpoint serve file download
app.get("/download", (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: "Parameter file wajib diisi" });

  const filePath = path.join(tmpDir, file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File tidak ditemukan" });

  res.download(filePath);
});

// ✅ Expose folder tmp untuk akses langsung
app.use("/tmp", express.static(tmpDir));

// ✅ Auto-clear file lebih dari 2 jam
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      const filePath = path.join(tmpDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 2 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        console.log("🗑️ File dihapus:", file);
      }
    }
  } catch (e) {
    console.error("❌ Gagal clear tmp:", e.message);
  }
}, 60 * 60 * 1000); // cek tiap 1 jam

app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));
