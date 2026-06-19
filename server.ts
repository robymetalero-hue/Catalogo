import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { Storage } from "@google-cloud/storage";
import { db } from "./src/db/index.ts";
import { products, storeConfig } from "./src/db/schema.ts";
import { eq, desc } from "drizzle-orm";

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

  // Expose virtual directory /uploads to resolve static files or stream from GCS with background write-back cache
  app.get("/uploads/:filename", async (req, res) => {
    const { filename } = req.params;
    const localFilePath = path.join(uploadDir, filename);

    // 1. If stored locally, serve it instantly with aggressive 1-year caching
    if (fs.existsSync(localFilePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localFilePath);
    }

    // 2. If GCS is active, check GCS and stream it
    if (gcsBucket) {
      try {
        const gcsFile = gcsBucket.file(filename);
        const [exists] = await gcsFile.exists();

        if (exists) {
          const [metadata] = await gcsFile.getMetadata();
          res.setHeader("Content-Type", metadata.contentType || "application/octet-stream");
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

          // Pipe the GCS stream directly to the response
          gcsFile.createReadStream().pipe(res);

          // Background task: write-back cache the file locally so subsequent requests are lightning-fast
          try {
            gcsFile.download({ destination: localFilePath }).catch((dwErr) => {
              console.warn(`[Google Cloud] No se pudo guardar copia local en caché para "${filename}":`, dwErr.message || dwErr);
            });
          } catch (writeErr) {
            // Safe to ignore in read-only setups
          }
          return;
        }
      } catch (gcsReadErr: any) {
        console.warn(`[Google Cloud] Error intentando transmitir "${filename}" desde GCS:`, gcsReadErr.message || gcsReadErr);
      }
    }

    // 3. Fallback
    return res.status(404).json({ error: "Archivo no encontrado" });
  });

  // Helper to guarantee an asynchronous call completes or times out to prevent HTTP request hang ups
  const runWithTimeout = <T>(promise: Promise<T>, ms: number, fallbackLabel: string): Promise<T> => {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timeout limit of ${ms}ms exceeded for ${fallbackLabel}`));
      }, ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      timeoutPromise
    ]);
  };

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
            // Uplifted timeout limit to 15 seconds to fully support direct camera snaps and video uploads
            console.log(`[Google Cloud] Subiendo "${file.filename}" duraderamente a GCS con límite de espera de 15s...`);
            const gcsFile = gcsBucket.file(file.filename);
            
            await runWithTimeout(
              gcsBucket.upload(file.path, {
                destination: file.filename,
                metadata: {
                  contentType: file.mimetype,
                  cacheControl: "public, max-age=31536000", // cache aggressively on GCS EDGE CDN
                },
              }),
              15000,
              "GCS file upload"
            );

            try {
              // Mark file public with 2 seconds timeout if possible, else it will stream authorized via our server route anyway
              await runWithTimeout(gcsFile.makePublic(), 2000, "GCS makePublic");
            } catch (aclErr: any) {
              console.warn("[Google Cloud] Could not alter ACL/make file public (Normal if Uniform Bucket Access is active). Streaming fallback will handle this:", aclErr.message || aclErr);
            }

            // Always use uniform relative path redirecting requests through our unified express media router
            urls.push(`/uploads/${file.filename}`);

            // Housekeeping: remove local ephemeral container file immediately to save local disk space,
            // as its durable version now lives safely in GCS
            try {
              fs.unlinkSync(file.path);
            } catch (unlinkErr) {
              console.warn("Fallo temporal limpiando archivo local:", unlinkErr);
            }
          } catch (gcsUploadErr: any) {
            console.warn(`[Google Cloud] Desvío de emergencia cargando a GCS (usando almacenamiento local): ${gcsUploadErr.message || gcsUploadErr}`);
            // Fallback to local URL if GCS fails or times out to avoid breaking user workflows
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

  // --- API DE TIENDA Y CONFIGURACIÓN ---
  
  // Obtener configuración de la tienda
  app.get("/api/store-config", async (req, res) => {
    try {
      const config = await db.select().from(storeConfig).where(eq(storeConfig.id, "default")).limit(1);
      if (config.length === 0) {
        // Sembrar valores por defecto si no existen
        const defaultDoc = {
          id: "default",
          storeName: "Mi Catálogo de WhatsApp",
          address: "",
          phone: "",
          whatsappNumber: "",
          whatsappCustomMessage: "Hola, me interesa este producto: {name} ({sku}) - {price}",
          locationUrl: "",
          showPrices: true,
          updatedAt: new Date()
        };
        const inserted = await db.insert(storeConfig).values(defaultDoc).returning();
        return res.json(inserted[0]);
      }
      return res.json(config[0]);
    } catch (error) {
      console.error("Error guardando el store-config:", error);
      return res.status(500).json({ error: "Error de base de datos cargando configuración de la tienda." });
    }
  });

  // Guardar/actualizar configuración de la tienda
  app.post("/api/store-config", async (req, res) => {
    try {
      const payload = req.body;
      const updated = await db.insert(storeConfig).values({
        id: "default",
        storeName: payload.storeName || "Mi Catálogo de WhatsApp",
        address: payload.address || "",
        phone: payload.phone || "",
        whatsappNumber: payload.whatsappNumber || "",
        whatsappCustomMessage: payload.whatsappCustomMessage || "Hola, me interesa este producto: {name} ({sku}) - {price}",
        locationUrl: payload.locationUrl || "",
        showPrices: payload.showPrices ?? true,
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: storeConfig.id,
        set: {
          storeName: payload.storeName || "Mi Catálogo de WhatsApp",
          address: payload.address || "",
          phone: payload.phone || "",
          whatsappNumber: payload.whatsappNumber || "",
          whatsappCustomMessage: payload.whatsappCustomMessage || "Hola, me interesa este producto: {name} ({sku}) - {price}",
          locationUrl: payload.locationUrl || "",
          showPrices: payload.showPrices ?? true,
          updatedAt: new Date()
        }
      }).returning();
      return res.json(updated[0]);
    } catch (error) {
      console.error("Error actualizando store-config:", error);
      return res.status(500).json({ error: "Error de base de datos actualizando configuración de la tienda." });
    }
  });

  // Obtener todos los productos
  app.get("/api/products", async (req, res) => {
    try {
      const allProducts = await db.select().from(products).orderBy(desc(products.createdAt));
      return res.json(allProducts);
    } catch (error: any) {
      console.error("Error obteniendo productos:", error);
      return res.status(500).json({ error: "Error de base de datos obteniendo lista de productos: " + (error.message || error) });
    }
  });

  // Crear un producto
  app.post("/api/products", async (req, res) => {
    try {
      const p = req.body;
      const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const result = await db.insert(products).values({
        id,
        sku: p.sku || "",
        name: p.name || "Sin nombre",
        description: p.description || "",
        category: p.category || "General",
        retailPrice: Number(p.retailPrice) || 0,
        wholesalePrice: Number(p.wholesalePrice) || 0,
        images: p.images || [],
        videoUrl: p.videoUrl || "",
        isAvailable: p.isAvailable ?? true,
        views: p.views || 0,
        whatsappClicks: p.whatsappClicks || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return res.json(result[0]);
    } catch (error: any) {
      console.error("Error creando producto:", error);
      return res.status(500).json({ error: "Error de base de datos creando producto: " + (error.message || error) });
    }
  });

  // Actualizar un producto
  app.put("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const p = req.body;
      const result = await db.update(products).set({
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        retailPrice: p.retailPrice !== undefined ? (Number(p.retailPrice) || 0) : undefined,
        wholesalePrice: p.wholesalePrice !== undefined ? (Number(p.wholesalePrice) || 0) : undefined,
        images: p.images,
        videoUrl: p.videoUrl,
        isAvailable: p.isAvailable,
        views: p.views,
        whatsappClicks: p.whatsappClicks,
        updatedAt: new Date(),
      }).where(eq(products.id, id)).returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Producto no encontrado." });
      }
      return res.json(result[0]);
    } catch (error: any) {
      console.error("Error actualizando producto:", error);
      return res.status(500).json({ error: "Error de base de datos actualizando producto: " + (error.message || error) });
    }
  });

  // Eliminar un producto
  app.delete("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.delete(products).where(eq(products.id, id)).returning();
      if (result.length === 0) {
        return res.status(404).json({ error: "Producto no encontrado." });
      }
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error eliminando producto:", error);
      return res.status(500).json({ error: "Error de base de datos eliminando producto: " + (error.message || error) });
    }
  });

  // Sembrar en lote productos de demostración
  app.post("/api/products/seed", async (req, res) => {
    try {
      const list = req.body;
      if (!Array.isArray(list)) {
        return res.status(400).json({ error: "Se requiere un arreglo de productos." });
      }
      
      const inserted = [];
      for (const p of list) {
        const row = await db.insert(products).values({
          id: p.id,
          sku: p.sku || "",
          name: p.name || "",
          description: p.description || "",
          category: p.category || "",
          retailPrice: parseFloat(p.retailPrice) || 0,
          wholesalePrice: parseFloat(p.wholesalePrice) || 0,
          images: p.images || [],
          videoUrl: p.videoUrl || "",
          isAvailable: p.isAvailable ?? true,
          views: p.views || 0,
          whatsappClicks: p.whatsappClicks || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: products.id,
          set: {
            sku: p.sku || "",
            name: p.name || "",
            description: p.description || "",
            category: p.category || "",
            retailPrice: parseFloat(p.retailPrice) || 0,
            wholesalePrice: parseFloat(p.wholesalePrice) || 0,
            images: p.images || [],
            videoUrl: p.videoUrl || "",
            isAvailable: p.isAvailable ?? true,
            updatedAt: new Date(),
          }
        }).returning();
        inserted.push(row[0]);
      }
      return res.json(inserted);
    } catch (error) {
      console.error("Error sembrando productos:", error);
      return res.status(500).json({ error: "Error de base de datos sembrando productos." });
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
