import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { Storage } from "@google-cloud/storage";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Google Cloud Storage setup (automatically authenticates with service account standard context)
  const gcsBucketName = process.env.GCS_BUCKET_NAME;
  let gcsBucket: any = null;
  if (gcsBucketName) {
    try {
      const storage = new Storage();
      gcsBucket = storage.bucket(gcsBucketName);
      console.log(`[Google Cloud] Storage activo habilitado para el bucket: "${gcsBucketName}"`);
    } catch (gcsInitErr) {
      console.warn("[Google Cloud] No se pudo inicializar GCS (usando fallback de almacenamiento local):", gcsInitErr);
    }
  }

  // Create absolute uploads path with a robust fallback for read-only filesystem environments (like standard Cloud Run containers)
  let uploadDir = path.join(process.cwd(), "public", "uploads");
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (error) {
    console.warn("No se pudo crear el directorio local 'public/uploads' (posible sistema de archivos de solo lectura). Usando '/tmp/uploads' como fallback:", error);
    uploadDir = path.join("/tmp", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  // Multer Storage Setup
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Append unique timestamp suffix to avoid overwriting files with identical names
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, "_");
      cb(null, `${name}-${uniqueSuffix}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB max size (covers longer videos)
    },
  });

  // Support extended payload limits
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Expose virtual directory /uploads to resolve static files with highly optimized cache settings (1 year)
  app.use(
    "/uploads",
    express.static(uploadDir, {
      maxAge: "365d",
      immutable: true,
      fallthrough: false,
    })
  );

  // Multi-file upload api route (images and videos) with optional GCS upload pipelines
  app.post("/api/upload", upload.array("files", 12), async (req: any, res: any) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No se subieron archivos." });
      }

      const urls: string[] = [];

      for (const file of files) {
        if (gcsBucket) {
          try {
            console.log(`[Google Cloud] Subiendo "${file.filename}" a GCS...`);
            await gcsBucket.upload(file.path, {
              destination: file.filename,
              metadata: {
                contentType: file.mimetype,
                cacheControl: "public, max-age=31536000", // cache aggressively on GCS EDGE CDN
              },
            });

            // Make the file public by default if permissions allow, or construct a generic URL.
            // On standard public buckets, this direct URL retrieves the file instantly with no performance delay.
            const publicUrl = `https://storage.googleapis.com/${gcsBucketName}/${file.filename}`;
            urls.push(publicUrl);

            // Housekeeping: remove local ephemeral container file immediately to save disk space
            try {
              fs.unlinkSync(file.path);
            } catch (unlinkErr) {
              console.warn("Fallo temporal limpiando archivo local:", unlinkErr);
            }
          } catch (gcsUploadErr) {
            console.error(`[Google Cloud] Desvío de emergencia cargando a GCS, usando local:`, gcsUploadErr);
            // Fallback to local URL if GCS fails to avoid breaking user workflows
            urls.push(`/uploads/${file.filename}`);
          }
        } else {
          // Normal local persistent mode with robust static server
          urls.push(`/uploads/${file.filename}`);
        }
      }

      return res.json({ urls });
    } catch (error) {
      console.error("Upload handler error:", error);
      return res.status(500).json({ error: "Error interno al procesar los archivos de catálogo." });
    }
  });

  // Serve app via Vite or static dist folder
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve production bundle with assets preloaded and browser optimized headers
    app.use(
      express.static(distPath, {
        maxAge: "7d",
        etag: true,
        setHeaders: (res, path) => {
          if (path.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        }
      })
    );
    
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
