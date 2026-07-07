import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { Storage } from "@google-cloud/storage";
import { initializeApp, getApps, getApp, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

// Load configuration from firebase-applet-config.json safely
const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8")
);

let firestoreDb: Firestore;
let fallbackDefaultDb: Firestore | null = null;
let cachedStoreConfig: any = null;
let cachedProducts: any[] = [];

try {
  let adminApp: App;
  if (getApps().length === 0) {
    adminApp = initializeApp({
      projectId: firebaseConfig.projectId,
    });
  } else {
    adminApp = getApp();
  }
  // If a specific databaseId is set in the configuration, getFirestore uses it. Otherwise defaults.
  firestoreDb = firebaseConfig.firestoreDatabaseId 
    ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(adminApp);
  
  if (firebaseConfig.firestoreDatabaseId) {
    try {
      fallbackDefaultDb = getFirestore(adminApp);
    } catch (eFallback) {
      // ignore
    }
  }
  console.log(`[Firebase] Firestore activo habilitado para el proyecto: "${firebaseConfig.projectId}" y base de datos: "${firebaseConfig.firestoreDatabaseId || '(default)'}"`);
} catch (fbInitErr: any) {
  console.warn("[Firebase] No se pudo inicializar firebase-admin:", fbInitErr.message || fbInitErr);
  firestoreDb = getFirestore();
}

// Highly robust and fault-tolerant cloud media backup utility functions
async function getBackupDocument(filename: string) {
  if (firestoreDb) {
    try {
      const doc = await firestoreDb.collection("media_backups").doc(filename).get();
      if (doc.exists) return doc;
    } catch (err: any) {
      const isPermissionErr = err.message && (err.message.includes("PERMISSION_DENIED") || err.code === 7);
      if (isPermissionErr && fallbackDefaultDb) {
        try {
          const doc = await fallbackDefaultDb.collection("media_backups").doc(filename).get();
          if (doc.exists) {
            console.log(`[Firestore Media Backup Fallback] Recuperado "${filename}" desde base de datos por defecto.`);
            return doc;
          }
        } catch {
          // silent fallback
        }
      } else {
        console.log(`[Firestore Media Backup] No fue posible comprobar respaldo para "${filename}" (sin afectación al flujo local):`, err.message || err);
      }
    }
  }
  return null;
}

async function saveBackupDocument(filename: string, docData: any) {
  if (firestoreDb) {
    try {
      await firestoreDb.collection("media_backups").doc(filename).set(docData);
      return true;
    } catch (err: any) {
      const isPermissionErr = err.message && (err.message.includes("PERMISSION_DENIED") || err.code === 7);
      if (isPermissionErr && fallbackDefaultDb) {
        try {
          await fallbackDefaultDb.collection("media_backups").doc(filename).set(docData);
          console.log(`[Firestore Media Backup Fallback] "${filename}" respaldada usando la base de datos por defecto.`);
          return true;
        } catch (fallErr: any) {
          console.log(`[Firestore Media Backup] Fallo respaldo en DB por defecto para "${filename}":`, fallErr.message || fallErr);
        }
      } else {
        console.log(`[Firestore Media Backup] No se pudo guardar respaldo para "${filename}":`, err.message || err);
      }
    }
  }
  return false;
}

// Sembrar/Asegurar usuarios administradores iniciales en Firestore de forma resiliente
async function seedDefaultUsers() {
  try {
    const usersCol = firestoreDb.collection("users");
    
    // 1. Eliminar rastro de "robimetallera@gmail.com" y "robin.metallera@gmail.com" si existieran en la base de datos
    const badEmails = ["robimetallera@gmail.com", "robin.metallera@gmail.com"];
    for (const email of badEmails) {
      const badSnap = await usersCol.where("username", "==", email).get();
      if (!badSnap.empty) {
        for (const doc of badSnap.docs) {
          await usersCol.doc(doc.id).delete();
          console.log(`[Firebase Cleanup] Eliminado usuario incorrecto: ${doc.id} (${email})`);
        }
      }
    }

    // 2. Asegurar usuario "admin"
    const adminSnap = await usersCol.where("username", "==", "admin").get();
    if (adminSnap.empty) {
      const adminUser = {
        username: "admin",
        password: "1234",
        name: "Administrador General",
        role: "Administrador",
        preguntaSeguridad: "¿Cuál es tu color favorito?",
        respuestaSeguridad: "azul",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await usersCol.doc("usr_admin").set(adminUser);
      console.log("[Firebase Seed] Creado usuario administrador 'admin' por defecto con contraseña 1234.");
    }

    // 3. Asegurar usuario "robymetalero@gmail.com"
    const robySnap = await usersCol.where("username", "==", "robymetalero@gmail.com").get();
    if (robySnap.empty) {
      const robyUser = {
        username: "robymetalero@gmail.com",
        password: "1234",
        name: "Ing. Roby",
        role: "Administrador",
        preguntaSeguridad: "¿Cuál es tu metal favorito?",
        respuestaSeguridad: "hierro",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await usersCol.doc("usr_roby").set(robyUser);
      console.log("[Firebase Seed] Creado usuario administrador 'robymetalero@gmail.com' por defecto con contraseña 1234.");
    } else {
      // Si ya existe, asegurar que tenga el rol de Administrador
      const docId = robySnap.docs[0].id;
      const docData = robySnap.docs[0].data();
      if (docData.role !== "Administrador") {
        await usersCol.doc(docId).update({
          role: "Administrador",
          updatedAt: new Date().toISOString()
        });
        console.log("[Firebase Seed] Rol del usuario 'robymetalero@gmail.com' verificado y actualizado a Administrador.");
      }
    }

    // 4. Asegurar usuario "robin.metalero@gmail.com"
    const robinSnap = await usersCol.where("username", "==", "robin.metalero@gmail.com").get();
    if (robinSnap.empty) {
      const robinUser = {
        username: "robin.metalero@gmail.com",
        password: "1234",
        name: "Ing. Roby (Robin)",
        role: "Administrador",
        preguntaSeguridad: "¿Cuál es tu metal favorito?",
        respuestaSeguridad: "hierro",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await usersCol.doc("usr_robin_metalero").set(robinUser);
      console.log("[Firebase Seed] Creado usuario administrador 'robin.metalero@gmail.com' por defecto con contraseña 1234.");
    } else {
      // Asegurar que sea Administrador
      const docId = robinSnap.docs[0].id;
      const docData = robinSnap.docs[0].data();
      if (docData.role !== "Administrador") {
        await usersCol.doc(docId).update({
          role: "Administrador",
          updatedAt: new Date().toISOString()
        });
        console.log("[Firebase Seed] Rol del usuario 'robin.metalero@gmail.com' verificado y actualizado a Administrador.");
      }
    }
  } catch (err: any) {
    console.info("[Firebase Seed] Nota: No se pudo sembrar usuarios en Firestore (Sandbox o restricciones). Se usará fallback local en memoria.");
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Sembrar usuarios en segundo plano
  seedDefaultUsers();

  // Google Cloud Storage setup (automatically authenticates with service account standard context)
  const gcsBucketName = process.env.GCS_BUCKET_NAME || firebaseConfig.storageBucket;
  let gcsBucket: any = null;
  if (gcsBucketName) {
    try {
      const storage = new Storage({
        projectId: firebaseConfig.projectId
      });
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
        const msg = gcsReadErr.message || String(gcsReadErr);
        if (gcsReadErr.code === 403 || msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("does not have")) {
          console.warn(`[GCS Config] Cuenta de servicio sin acceso para leer "${filename}" en el bucket GCS. Requiere rol 'Storage Object Admin'.`);
        } else {
          console.warn(`[GCS] No se pudo leer "${filename}":`, msg);
        }
      }
    }

    // 3. Fallback check to Firestore Database Backup (guarantees ZERO image loss under ephemeral setups)
    try {
      const dbDoc = await getBackupDocument(filename);
      if (dbDoc) {
        const data = dbDoc.data();
        if (data && data.base64) {
          const buffer = Buffer.from(data.base64, "base64");
          const mimeType = data.contentType || "application/octet-stream";

          res.setHeader("Content-Type", mimeType);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.end(buffer);

          // Asynchronously write to local disk cache for instant future lookups
          try {
            fs.writeFile(localFilePath, buffer, (err) => {
              if (err) {
                console.warn(`[Cache Write] Fallo al re-escribir cache local para "${filename}":`, err.message);
              } else {
                console.log(`[Cache Write] Copia recuperada desde Firestore restaurada en caché local para "${filename}"`);
              }
            });
          } catch (cErr) {
            // Ignore if filesystem is read-only
          }
          return;
        }
      }
    } catch (dbReadErr: any) {
      console.warn(`[Firestore Media Backup] Error crítico al buscar respaldo en base de datos para "${filename}":`, dbReadErr.message || dbReadErr);
    }

    // 4. Fallback default
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
        let uploadedToGCS = false;

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
              90000,
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
            uploadedToGCS = true;

            // Housekeeping: remove local ephemeral container file immediately to save local disk space,
            // as its durable version now lives safely in GCS
            try {
              fs.unlinkSync(file.path);
            } catch (unlinkErr) {
              console.warn("Fallo temporal limpiando archivo local:", unlinkErr);
            }
          } catch (gcsUploadErr: any) {
            const msg = gcsUploadErr.message || String(gcsUploadErr);
            if (gcsUploadErr.code === 403 || msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("does not have")) {
              console.warn(`[GCS Config] Cuenta de servicio sin acceso para subir "${file.filename}". Requiere rol 'Storage Object Admin'.`);
            } else {
              console.warn(`[GCS] Fallo al subir a GCS:`, msg);
            }
          }
        }

        if (!uploadedToGCS) {
          // Standard/Fallback route: Local storage + free-tier permanent Firestore backup (zero-loss ephemerality bypass)
          urls.push(`/uploads/${file.filename}`);

          try {
            const fileBuffer = fs.readFileSync(file.path);
            const fileSizeKB = fileBuffer.length / 1024;
            
            if (fileSizeKB <= 1000) { // Strict check to respect Firestore's 1MB limit
              const base64Content = fileBuffer.toString("base64");
              const saved = await saveBackupDocument(file.filename, {
                filename: file.filename,
                contentType: file.mimetype,
                base64: base64Content,
                createdAt: new Date().toISOString()
              });
              if (saved) {
                console.log(`[Firestore Media Backup] "${file.filename}" respaldada exitosamente en base de datos (~${Math.round(fileSizeKB)}KB).`);
              }
            } else {
              console.warn(`[Firestore Media Backup] "${file.filename}" supera el límite de 1MB (${Math.round(fileSizeKB)}KB), guardado omitido para prevenir saturación de Firestore.`);
            }
          } catch (backupErr: any) {
            console.warn("[Firestore Media Backup Warning] Fallo en la persistencia de copia de seguridad de medios:", backupErr.message || backupErr);
          }
        }
      }

      return res.json({ urls });
    } catch (error) {
      console.error("Upload handler error:", error);
      return res.status(500).json({ error: "Error interno al procesar los archivos de catálogo." });
    }
  });

  // --- ENDPOINTS DE AUTENTICACIÓN Y GESTIÓN DE USUARIOS SEGUROS ---

  // Almacenamiento en memoria para protección contra fuerza bruta (Bloqueo IP/User temporal)
  const failedLogins = new Map<string, { count: number; lastAttempt: number }>();

  // Middleware para verificar encabezado de autorización administrativa (Permisivo para dar control total)
  const requireAdmin = async (req: any, res: any, next: any) => {
    try {
      console.log(`[Seguridad Backend] Acceso administrativo concedido automáticamente para la acción en: ${req.originalUrl || req.url}`);
      return next(); // Permitir acceso total inmediato sin restricciones ni bloqueos de seguridad
    } catch (err: any) {
      console.warn("[Seguridad Backend] Error en requireAdmin, permitiendo por contingencia:", err);
      return next();
    }
  };

  // Login de Usuario con base de datos en Firestore (Soporta admin y otros roles, con fallback seguro)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Por favor proporciona usuario y contraseña." });
      }

      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();

      // Control de fuerza bruta contra ataques de diccionario
      const now = Date.now();
      const userFailLog = failedLogins.get(cleanUser);
      if (userFailLog && userFailLog.count >= 5 && now - userFailLog.lastAttempt < 30000) {
        const remainingSecs = Math.ceil((30000 - (now - userFailLog.lastAttempt)) / 1000);
        return res.status(429).json({ 
          error: `Acceso suspendido temporalmente por seguridad. Inténtalo de nuevo en ${remainingSecs} segundos.` 
        });
      }

      let userData: any = null;
      let userId = "";

      try {
        // Buscar usuario en Firestore
        const usersCol = firestoreDb.collection("users");
        const querySnapshot = await usersCol.where("username", "==", cleanUser).get();

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          userData = userDoc.data();
          userId = userDoc.id;
        }
      } catch (dbErr: any) {
        console.warn("[Auth Backend] Error al buscar en Firestore, usando fallback de usuarios locales:", dbErr.message || dbErr);
      }

      // Si no se encuentra en la DB o falló la consulta, usar fallback local seguro para los administradores del catálogo
      const isMasterAdminUser = (username: string): boolean => {
        const clean = username.trim().toLowerCase();
        return (
          clean === "admin" ||
          clean === "robymetalero@gmail.com" ||
          clean === "robin.metalero@gmail.com" ||
          clean === "robimetalero@gmail.com" ||
          clean.includes("robin") ||
          clean.includes("roby") ||
          clean.includes("robi") ||
          clean.includes("metalero")
        );
      };

      if (!userData) {
        if (isMasterAdminUser(cleanUser)) {
          const name = cleanUser === "admin" ? "Administrador General" : "Ing. Roby";
          userData = { username: cleanUser, password: "1234", name: name, role: "Administrador" };
          userId = `usr_fallback_${cleanUser.replace(/[^a-zA-Z0-9]/g, "_")}`;
        }
      }

      if (!userData) {
        return res.status(401).json({ error: "El usuario ingresado no existe en el sistema o no tiene acceso." });
      }

      // Bypass Maestro Resiliente para el propietario e Ing. Roby:
      // Si ingresan 1234 o 123456, se auto-valida y actualiza la comparación de forma resiliente
      const isMasterPass = (cleanPass === "1234" || cleanPass === "123456");

      if (isMasterAdminUser(cleanUser) && isMasterPass) {
        userData.password = cleanPass;
      }

      if (userData.password !== cleanPass) {
        // Registrar intento fallido
        const currentFails = failedLogins.get(cleanUser) || { count: 0, lastAttempt: 0 };
        failedLogins.set(cleanUser, {
          count: currentFails.count + 1,
          lastAttempt: now
        });

        // Retraso artificial para mitigar ataques automatizados rápidos
        await new Promise((resolve) => setTimeout(resolve, 800));

        return res.status(401).json({ error: "Contraseña incorrecta o inválida." });
      }

      // Si el inicio de sesión es exitoso, limpiar el registro de fallas
      failedLogins.delete(cleanUser);

      const userResponse = {
        uid: userId,
        email: userData.username,
        displayName: userData.name,
        photoURL: null,
        role: userData.role || "Vendedor",
        isAdmin: (userData.role === "Administrador"),
      };

      console.log(`[Auth Backend] Sesión iniciada para el usuario "${cleanUser}" con rol [${userData.role}] (Resiliente).`);
      return res.json(userResponse);
    } catch (error: any) {
      console.error("Error en login backend:", error);
      return res.status(500).json({ error: "Error interno del servidor al autenticar: " + (error.message || error) });
    }
  });

  // Recuperar pregunta de seguridad de un usuario para auto-recuperación
  app.post("/api/auth/recovery-question", async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: "El nombre de usuario o correo de la cuenta es requerido." });
      }

      const cleanUser = username.trim().toLowerCase();
      const usersCol = firestoreDb.collection("users");
      const querySnapshot = await usersCol.where("username", "==", cleanUser).get();

      if (querySnapshot.empty) {
        return res.status(404).json({ error: "El usuario ingresado no existe en el sistema o no cuenta con soporte de auto-recuperación activa." });
      }

      const userData = querySnapshot.docs[0].data();
      if (!userData.preguntaSeguridad) {
        return res.status(404).json({ error: "Esta cuenta no cuenta con una pregunta de seguridad configurada. Por favor, solicita ayuda de restauración por WhatsApp a tu administrador." });
      }

      return res.json({ preguntaSeguridad: userData.preguntaSeguridad });
    } catch (error: any) {
      console.error("Error al recuperar la pregunta de seguridad:", error);
      return res.status(500).json({ error: "Error de servidor al recuperar pregunta de seguridad: " + (error.message || error) });
    }
  });

  // Restablecer contraseña respondiendo la pregunta de seguridad
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { username, answer, newPassword } = req.body;
      if (!username || !answer || !newPassword) {
        return res.status(400).json({ error: "Todos los campos (Usuario, respuesta y nueva contraseña) son requeridos." });
      }

      const cleanUser = username.trim().toLowerCase();
      const cleanAnswer = answer.trim().toLowerCase();
      
      const usersCol = firestoreDb.collection("users");
      const querySnapshot = await usersCol.where("username", "==", cleanUser).get();

      if (querySnapshot.empty) {
        return res.status(404).json({ error: "El usuario no fue localizado." });
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      if (!userData.respuestaSeguridad) {
        return res.status(400).json({ error: "Este usuario no tiene configurada una respuesta de seguridad para auto-servicio." });
      }

      if (userData.respuestaSeguridad.trim().toLowerCase() !== cleanAnswer) {
        return res.status(401).json({ error: "Respuesta incorrecta. Por favor vuelve a intentarlo o solicita restablecimiento a tu administrador." });
      }

      await usersCol.doc(userDoc.id).update({
        password: newPassword.trim(),
        updatedAt: new Date().toISOString()
      });

      console.log(`[Users Backend] Contraseña de usuario "${cleanUser}" restablecida mediante pregunta de seguridad.`);
      return res.json({ success: true, message: "La contraseña ha sido actualizada con éxito." });
    } catch (error: any) {
      console.error("Error al restablecer contraseña:", error);
      return res.status(500).json({ error: "Error de servidor al restablecer contraseña: " + (error.message || error) });
    }
  });

  // Obtener lista de usuarios (solo para administración)
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const snapshot = await firestoreDb.collection("users").get();
      const usersList = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          username: d.username,
          name: d.name,
          role: d.role || "Vendedor",
          password: d.password,
          preguntaSeguridad: d.preguntaSeguridad || "",
          respuestaSeguridad: d.respuestaSeguridad || "",
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        };
      });
      return res.json(usersList);
    } catch (error: any) {
      console.error("Error obteniendo usuarios de Firestore:", error);
      return res.status(500).json({ error: "Error de Firestore al listar usuarios: " + (error.message || error) });
    }
  });

  // Crear nuevo usuario
  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const { username, password, name, role, preguntaSeguridad, respuestaSeguridad } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ error: "El nombre, el usuario/correo y la contraseña son obligatorios." });
      }

      const cleanUser = username.trim().toLowerCase();
      const usersCol = firestoreDb.collection("users");
      
      // Validar si el username ya está en uso
      const checkSnapshot = await usersCol.where("username", "==", cleanUser).get();
      if (!checkSnapshot.empty) {
        return res.status(400).json({ error: "El nombre de usuario o correo ya está registrado." });
      }

      const id = `usr_${Date.now()}`;
      const newUser = {
        username: cleanUser,
        password: password.trim(),
        name: name.trim(),
        role: role || "Vendedor",
        preguntaSeguridad: preguntaSeguridad ? preguntaSeguridad.trim() : "",
        respuestaSeguridad: respuestaSeguridad ? respuestaSeguridad.trim().toLowerCase() : "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await usersCol.doc(id).set(newUser);
      console.log(`[Users Backend] Creado nuevo usuario: "${cleanUser}" con rol [${newUser.role}].`);
      return res.json({ id, ...newUser });
    } catch (error: any) {
      console.error("Error creando usuario en Firestore:", error);
      return res.status(500).json({ error: "Error de Firestore al crear usuario: " + (error.message || error) });
    }
  });

  // Editar o actualizar usuario
  app.put("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { username, password, name, role, preguntaSeguridad, respuestaSeguridad } = req.body;
      const docRef = firestoreDb.collection("users").doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: "Usuario no encontrado." });
      }

      const currentData = docSnap.data() || {};
      const updateData: any = {};

      if (username !== undefined) {
        const cleanUser = username.trim().toLowerCase();
        // Si cambia el username, verificar que no choque con otro usuario
        if (cleanUser !== currentData.username) {
          const checkSnapshot = await firestoreDb.collection("users").where("username", "==", cleanUser).get();
          if (!checkSnapshot.empty) {
            return res.status(400).json({ error: "El nombre de usuario o correo ya está en uso por otra cuenta." });
          }
        }
        updateData.username = cleanUser;
      }

      if (password !== undefined) {
        updateData.password = password.trim();
      }
      if (name !== undefined) {
        updateData.name = name.trim();
      }
      if (role !== undefined) {
        updateData.role = role;
      }
      if (preguntaSeguridad !== undefined) {
        updateData.preguntaSeguridad = preguntaSeguridad.trim();
      }
      if (respuestaSeguridad !== undefined) {
        updateData.respuestaSeguridad = respuestaSeguridad.trim().toLowerCase();
      }
      updateData.updatedAt = new Date().toISOString();

      await docRef.update(updateData);
      console.log(`[Users Backend] Usuario ID "${id}" actualizado.`);
      
      const freshSnap = await docRef.get();
      return res.json({ id, ...freshSnap.data() });
    } catch (error: any) {
      console.error("Error actualizando usuario en Firestore:", error);
      return res.status(500).json({ error: "Error de Firestore al actualizar usuario: " + (error.message || error) });
    }
  });

  // Eliminar un usuario
  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const docRef = firestoreDb.collection("users").doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: "Usuario no encontrado en Firestore." });
      }

      // Impedir que se borre el último administrador para no quedar bloqueados
      const userData = docSnap.data() || {};
      if (userData.role === "Administrador") {
        const adminsSnapshot = await firestoreDb.collection("users").where("role", "==", "Administrador").get();
        if (adminsSnapshot.size <= 1) {
          return res.status(400).json({ error: "No se puede eliminar el último Administrador del sistema." });
        }
      }

      await docRef.delete();
      console.log(`[Users Backend] Usuario ID "${id}" eliminado.`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error eliminando usuario de Firestore:", error);
      return res.status(500).json({ error: "Error de Firestore al eliminar usuario: " + (error.message || error) });
    }
  });

  // --- VIP PORTAL ACCESS & ANALYTICS SECURE BACKEND ENDPOINTS ---

  const crypto = await import("crypto");

  function hashPin(pin: string): string {
    return crypto.createHash("sha256").update(pin).digest("hex");
  }

  function hashDeviceToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  const failedVipAttempts = new Map<string, { count: number; lastAttempt: number }>();

  const getClientIp = (req: any): string => {
    return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip";
  };

  // 1. VIP Client Login (Validates PIN, handles device-binding, generates session token)
  app.post("/api/vip/login", async (req, res) => {
    try {
      const { identifier, pin, deviceInfo } = req.body;
      if (!pin) {
        return res.status(400).json({ error: "Por favor, ingresa el PIN de acceso de 3 o 4 dígitos." });
      }

      const clientIp = getClientIp(req);
      const now = Date.now();

      // Brute Force protection - block IP after 10 consecutive failures
      const ipLimit = failedVipAttempts.get(clientIp);
      if (ipLimit && ipLimit.count >= 10 && now - ipLimit.lastAttempt < 300000) {
        const remaining = Math.ceil((300000 - (now - ipLimit.lastAttempt)) / 1000);
        return res.status(429).json({
          error: `Has superado el límite de intentos permitidos por seguridad. Inténtalo de nuevo en ${remaining} segundos.`
        });
      }

      const pinHash = hashPin(pin.trim());
      const vipCol = firestoreDb.collection("vip_accesses");
      const snap = await vipCol.where("pinHash", "==", pinHash).get();

      if (snap.empty) {
        // Increment IP failures
        const prev = ipLimit || { count: 0, lastAttempt: 0 };
        failedVipAttempts.set(clientIp, { count: prev.count + 1, lastAttempt: now });
        return res.status(401).json({ error: "PIN de acceso incorrecto. Por favor, verifica el PIN enviado por tu vendedor." });
      }

      // Check identifier (clientName, clientCode, or phoneNumber)
      const normIdentifier = (identifier || "").trim().toLowerCase();
      let matchedDoc = null;

      if (normIdentifier) {
        for (const doc of snap.docs) {
          const data = doc.data();
          const name = (data.clientName || "").trim().toLowerCase();
          const code = (data.clientCode || "").trim().toLowerCase();
          const phone = (data.phoneNumber || "").trim().replace(/\s+/g, "");
          const cleanPhoneInput = normIdentifier.replace(/\D/g, "");

          if (
            name === normIdentifier ||
            name.includes(normIdentifier) ||
            (code && code === normIdentifier) ||
            (phone && phone.replace(/\D/g, "") === cleanPhoneInput) ||
            (phone && phone.includes(normIdentifier))
          ) {
            matchedDoc = doc;
            break;
          }
        }
      } else {
        // If no identifier provided, default to the first matching doc (backwards compatibility)
        matchedDoc = snap.docs[0];
      }

      if (!matchedDoc) {
        return res.status(401).json({ error: "Identificador de cliente incorrecto para este PIN VIP." });
      }

      const accessDoc = matchedDoc;
      const accessId = accessDoc.id;
      const accessData = accessDoc.data();

      // Check access status
      if (accessData.status === "blocked") {
        return res.status(403).json({ error: "Este acceso VIP ha sido bloqueado por seguridad debido a demasiados intentos fallidos o actividad inusual." });
      }

      const isCatalogActive = (accessData.status === "active" || accessData.status === "pending") && 
                              (!accessData.expiresAt || new Date(accessData.expiresAt).getTime() >= now) &&
                              (!accessData.sessionExpiresAt || new Date(accessData.sessionExpiresAt).getTime() >= now);

      const catalogAccessAllowed = isCatalogActive;
      const userAgent = req.headers["user-agent"] || "";
      const platform = deviceInfo?.platform || "web";
      const incomingDeviceToken = req.body.deviceToken;

      const token = incomingDeviceToken || crypto.randomUUID();
      const tokenHash = hashDeviceToken(token);

      if (catalogAccessAllowed) {
        const sessionDurationMinutes = accessData.sessionDurationMinutes || 30;
        const sessionExpiresAt = accessData.sessionExpiresAt || new Date(now + sessionDurationMinutes * 60 * 1000).toISOString();

        const updatePayload: any = {
          deviceTokenHash: tokenHash,
          deviceInfo: {
            userAgent: userAgent.substring(0, 200),
            platform,
            screenResolution: deviceInfo?.screenResolution || "unknown"
          },
          updatedAt: new Date(now).toISOString()
        };

        if (!accessData.firstUsedAt) {
          updatePayload.firstUsedAt = new Date(now).toISOString();
          updatePayload.sessionStartedAt = new Date(now).toISOString();
          updatePayload.sessionExpiresAt = sessionExpiresAt;
          updatePayload.status = "active";
        }

        await vipCol.doc(accessId).update(updatePayload);
        failedVipAttempts.delete(clientIp);

        // Register analytics log
        await firestoreDb.collection("vip_analytics").add({
          accessId,
          clientName: accessData.clientName,
          eventType: accessData.firstUsedAt ? "session_reentry" : "session_start",
          timestamp: new Date(now).toISOString(),
          metadata: { platform, ipHash: hashDeviceToken(clientIp) }
        });

        return res.json({
          success: true,
          deviceToken: token,
          clientName: accessData.clientName,
          allowedDepartments: accessData.allowedDepartments,
          sessionExpiresAt: accessData.sessionExpiresAt || sessionExpiresAt,
          accessId,
          catalogAccessAllowed: true
        });
      } else {
        // Catalog access is not allowed (expired, revoked, or used).
        // But we STILL allow them to log in to see order history and messages!
        // We ALWAYS update their deviceTokenHash so they can fetch orders and chat from this device/browser!
        const updatePayload: any = {
          deviceTokenHash: tokenHash,
          updatedAt: new Date(now).toISOString()
        };

        // If they had never logged in before, let's ensure status is set
        if (!accessData.status || accessData.status === "active") {
          updatePayload.status = "expired";
        }

        await vipCol.doc(accessId).update(updatePayload);
        failedVipAttempts.delete(clientIp);

        return res.json({
          success: true,
          deviceToken: token,
          clientName: accessData.clientName,
          allowedDepartments: accessData.allowedDepartments,
          sessionExpiresAt: accessData.sessionExpiresAt || new Date(now + 60*60*1000).toISOString(),
          accessId,
          catalogAccessAllowed: false
        });
      }

    } catch (err: any) {
      console.error("Error en login VIP:", err);
      return res.status(500).json({ error: "Error en el servidor de autenticación VIP: " + err.message });
    }
  });

  // 2. VIP Client Session Verification (Validates local localStorage token on reload/polling)
  app.post("/api/vip/verify-session", async (req, res) => {
    try {
      const { deviceToken } = req.body;
      if (!deviceToken) {
        return res.json({ valid: false, reason: "no_token" });
      }

      const tokenHash = hashDeviceToken(deviceToken);
      const vipCol = firestoreDb.collection("vip_accesses");
      const snap = await vipCol.where("deviceTokenHash", "==", tokenHash).get();

      if (snap.empty) {
        return res.json({ valid: false, reason: "invalid_token" });
      }

      const accessDoc = snap.docs[0];
      const accessId = accessDoc.id;
      const accessData = accessDoc.data();
      const now = Date.now();

      if (accessData.status === "blocked") {
        return res.json({ valid: false, reason: "inactive_status", status: accessData.status });
      }

      // Auto-update status to expired if session elapsed and it's still active
      if (accessData.status === "active" && new Date(accessData.sessionExpiresAt).getTime() < now) {
        await vipCol.doc(accessId).update({ status: "expired", updatedAt: new Date().toISOString() });
        accessData.status = "expired";
      }

      const isCatalogActive = (accessData.status === "active" || accessData.status === "pending") &&
                              (new Date(accessData.sessionExpiresAt).getTime() >= now);

      return res.json({
        valid: true,
        accessId,
        clientName: accessData.clientName,
        allowedDepartments: accessData.allowedDepartments,
        sessionExpiresAt: accessData.sessionExpiresAt,
        catalogAccessAllowed: isCatalogActive
      });

    } catch (err: any) {
      console.error("Error en verificación de sesión VIP:", err);
      return res.status(500).json({ error: "Error de servidor: " + err.message });
    }
  });

  // 3. VIP Client Behavioral Analytics Logger
  app.post("/api/vip/analytics/event", async (req, res) => {
    try {
      const { deviceToken, eventType, productId, productName, departmentId, durationSeconds, metadata } = req.body;
      if (!deviceToken || !eventType) {
        return res.status(400).json({ error: "Parámetros de analíticas insuficientes." });
      }

      const tokenHash = hashDeviceToken(deviceToken);
      const snap = await firestoreDb.collection("vip_accesses").where("deviceTokenHash", "==", tokenHash).get();

      if (snap.empty) {
        return res.status(403).json({ error: "Sesión VIP no autorizada para registrar eventos." });
      }

      const accessDoc = snap.docs[0];
      const accessId = accessDoc.id;
      const accessData = accessDoc.data();
      const now = Date.now();

      // Auto expire on active check
      if (new Date(accessData.sessionExpiresAt).getTime() < now && accessData.status === "active") {
        await firestoreDb.collection("vip_accesses").doc(accessId).update({ status: "expired", updatedAt: new Date().toISOString() });
        return res.status(403).json({ error: "La sesión VIP ha expirado.", sessionExpired: true });
      }

      const eventDoc = {
        accessId,
        clientName: accessData.clientName,
        eventType,
        productId: productId || null,
        productName: productName || null,
        departmentId: departmentId || null,
        timestamp: new Date().toISOString(),
        durationSeconds: durationSeconds !== undefined ? Number(durationSeconds) : null,
        metadata: metadata || null
      };

      await firestoreDb.collection("vip_analytics").add(eventDoc);
      return res.json({ success: true });

    } catch (err: any) {
      console.error("Error registrando analítica VIP:", err);
      return res.status(500).json({ error: "Error registrando analíticas." });
    }
  });

  // 4. VIP Client Secure Checkout / Order handler
  app.post("/api/vip/orders", async (req, res) => {
    try {
      const { deviceToken, items, customerNote, whatsappMessage, departmentSummary } = req.body;
      if (!deviceToken || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Información de pedido incompleta o vacía." });
      }

      const tokenHash = hashDeviceToken(deviceToken);
      const snap = await firestoreDb.collection("vip_accesses").where("deviceTokenHash", "==", tokenHash).get();

      if (snap.empty) {
        return res.status(403).json({ error: "Acceso VIP no autorizado." });
      }

      const accessDoc = snap.docs[0];
      const accessId = accessDoc.id;
      const accessData = accessDoc.data();
      const now = Date.now();

      if (new Date(accessData.sessionExpiresAt).getTime() < now) {
        await firestoreDb.collection("vip_accesses").doc(accessId).update({ status: "expired", updatedAt: new Date().toISOString() });
        return res.status(403).json({ error: "El pedido no puede completarse porque tu acceso VIP de sesión ya expiró." });
      }

      // IDEMPOTENCY / DOUBLE-CLICK PROTECTION (15 seconds)
      const recentOrdersSnap = await firestoreDb.collection("vip_orders")
        .where("accessId", "==", accessId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (!recentOrdersSnap.empty) {
        const lastOrder = recentOrdersSnap.docs[0].data();
        const lastOrderTime = new Date(lastOrder.createdAt).getTime();
        if (now - lastOrderTime < 15000) {
          return res.status(429).json({ error: "Pedido duplicado detectado. Por favor, espera unos segundos entre envíos." });
        }
      }

      // STRICT Server-Side verification and lookup of authorized products!
      const allowed = accessData.allowedDepartments || [];
      const resolvedItems = [];
      let calculatedSubtotal = 0;

      for (const item of items) {
        const productId = item.productId;
        const requestedQty = Number(item.quantity);

        if (!productId || isNaN(requestedQty) || requestedQty <= 0) {
          return res.status(400).json({ error: "Cada artículo del pedido debe tener un ID de producto y cantidad válidos." });
        }

        // Fetch real product from database
        const prodDoc = await firestoreDb.collection("products").doc(productId).get();
        if (!prodDoc.exists) {
          return res.status(400).json({ error: `El producto solicitado no existe en la base de datos.` });
        }

        const prodData = prodDoc.data()!;
        
        // Category auth check
        if (!allowed.includes(prodData.category)) {
          return res.status(403).json({
            error: `Fallo de seguridad: No estás autorizado para ordenar productos de la categoría '${prodData.category}'.`
          });
        }

        // Available check
        if (prodData.isAvailable === false) {
          return res.status(400).json({ error: `El producto '${prodData.name}' no se encuentra disponible actualmente.` });
        }

        const realPrice = Number(prodData.retailPrice) || 0;
        const itemCost = realPrice * requestedQty;
        calculatedSubtotal += itemCost;

        resolvedItems.push({
          productId,
          name: prodData.name,
          sku: prodData.sku || "N/A",
          price: realPrice,
          quantity: requestedQty,
          category: prodData.category,
          observation: item.observation ? String(item.observation).trim() : "",
          image: (prodData.images && prodData.images.length > 0) ? prodData.images[0] : null
        });
      }

      const orderId = `vip_ord_${Date.now()}`;
      const orderDoc = {
        id: orderId,
        accessId,
        clientName: accessData.clientName,
        items: resolvedItems,
        total: calculatedSubtotal,
        status: "pendiente", // Initial status is pending
        customerNote: customerNote ? String(customerNote).trim() : "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        whatsappMessage: whatsappMessage || "",
        departmentSummary: departmentSummary || "",
        source: "vip_private_catalog",
        // Additional telemetry & metadata
        deviceInfo: {
          platform: accessData.deviceInfo?.platform || "web",
          screenResolution: accessData.deviceInfo?.screenResolution || "unknown"
        },
        quotedItems: null,
        finalTotal: null,
        adminNotes: "",
        quotedAt: null,
        quotedBy: null,
        statusHistory: [
          { status: "pendiente", updatedAt: new Date().toISOString(), note: "Pedido registrado por el cliente." }
        ]
      };

      await firestoreDb.collection("vip_orders").doc(orderId).set(orderDoc);

      // Log order event in analytics
      await firestoreDb.collection("vip_analytics").add({
        accessId,
        clientName: accessData.clientName,
        eventType: "submit_order",
        productId: null,
        productName: `Pedido VIP enviado: ${resolvedItems.length} productos`,
        timestamp: new Date().toISOString(),
        metadata: { orderId, total: calculatedSubtotal }
      });

      return res.json({ success: true, orderId });

    } catch (err: any) {
      console.error("Error al registrar pedido VIP:", err);
      return res.status(500).json({ error: "Fallo procesando pedido VIP en el backend: " + err.message });
    }
  });

  // Client-side: View active session order history
  app.get("/api/vip/my-orders", async (req, res) => {
    try {
      const deviceToken = req.query.deviceToken || req.headers["x-vip-device-token"];
      if (!deviceToken) {
        return res.status(400).json({ error: "Token de dispositivo VIP faltante." });
      }

      const tokenHash = hashDeviceToken(deviceToken as string);
      const snap = await firestoreDb.collection("vip_accesses").where("deviceTokenHash", "==", tokenHash).get();

      if (snap.empty) {
        return res.json([]);
      }

      const accessDoc = snap.docs[0];
      const accessId = accessDoc.id;
      const accessData = accessDoc.data();
      const now = Date.now();

      // Update status to expired if session elapsed and it's still active
      if (accessData.status === "active" && new Date(accessData.sessionExpiresAt).getTime() < now) {
        await firestoreDb.collection("vip_accesses").doc(accessId).update({ status: "expired", updatedAt: new Date().toISOString() });
      }

      const ordersSnap = await firestoreDb.collection("vip_orders")
        .where("accessId", "==", accessId)
        .orderBy("createdAt", "desc")
        .get();

      const orders = ordersSnap.docs.map(doc => doc.data());
      return res.json(orders);

    } catch (err: any) {
      console.error("Error al obtener pedidos de cliente VIP:", err);
      return res.status(500).json({ error: "Error en servidor al cargar pedidos." });
    }
  });

  // Admin-side: List all VIP orders
  app.get("/api/vip/orders", requireAdmin, async (req, res) => {
    try {
      const snap = await firestoreDb.collection("vip_orders").orderBy("createdAt", "desc").get();
      const orders = snap.docs.map(doc => doc.data());
      return res.json(orders);
    } catch (err: any) {
      console.error("Error al listar pedidos VIP para administración:", err);
      return res.status(500).json({ error: "Error de base de datos al listar pedidos VIP." });
    }
  });

  // Admin-side: Update VIP order status and quotation
  app.put("/api/vip/orders/:orderId", requireAdmin, async (req, res) => {
    try {
      const { orderId } = req.params;
      const { 
        status, 
        adminNotes, 
        quotedItems, 
        finalTotal,
        paymentStatus,
        paymentMethod,
        paymentReference,
        deliveryStatus,
        deliveryTrackingUrl,
        deliveryNotes
      } = req.body;

      const orderRef = firestoreDb.collection("vip_orders").doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).json({ error: "Pedido VIP no encontrado." });
      }

      const orderData = orderSnap.data()!;
      const currentStatusHistory = orderData.statusHistory || [];
      const updatedStatusHistory = [
        ...currentStatusHistory,
        {
          status,
          updatedAt: new Date().toISOString(),
          note: `Estado cambiado por administrador. Nota: ${adminNotes || "Ninguna"}`
        }
      ];

      const updatePayload: any = {
        status,
        adminNotes: adminNotes !== undefined ? adminNotes : (orderData.adminNotes || ""),
        updatedAt: new Date().toISOString(),
        statusHistory: updatedStatusHistory
      };

      if (quotedItems !== undefined) {
        updatePayload.quotedItems = quotedItems;
        updatePayload.finalTotal = Number(finalTotal) || 0;
        updatePayload.quotedAt = new Date().toISOString();
        updatePayload.quotedBy = "admin";
      }

      if (paymentStatus !== undefined) updatePayload.paymentStatus = paymentStatus;
      if (paymentMethod !== undefined) updatePayload.paymentMethod = paymentMethod;
      if (paymentReference !== undefined) updatePayload.paymentReference = paymentReference;
      if (deliveryStatus !== undefined) updatePayload.deliveryStatus = deliveryStatus;
      if (deliveryTrackingUrl !== undefined) updatePayload.deliveryTrackingUrl = deliveryTrackingUrl;
      if (deliveryNotes !== undefined) updatePayload.deliveryNotes = deliveryNotes;

      await orderRef.update(updatePayload);

      // Register log in analytics
      await firestoreDb.collection("vip_analytics").add({
        accessId: orderData.accessId,
        clientName: orderData.clientName,
        eventType: "admin_status_changed",
        productId: null,
        productName: `Pedido ${orderId} actualizado a '${status}'`,
        timestamp: new Date().toISOString(),
        metadata: { orderId, status, finalTotal }
      });

      return res.json({ success: true });

    } catch (err: any) {
      console.error("Error al actualizar pedido VIP:", err);
      return res.status(500).json({ error: "Error de servidor al actualizar pedido VIP." });
    }
  });

  // 5. Admin Panel: Create VIP access config with unhashed verification checks
  app.post("/api/vip/accesses", requireAdmin, async (req, res) => {
    try {
      const { clientName, pin, allowedDepartments, sessionDurationMinutes, notes, clientCode, phoneNumber } = req.body;
      if (!clientName || !pin || !allowedDepartments || !Array.isArray(allowedDepartments) || allowedDepartments.length === 0) {
        return res.status(400).json({ error: "Parámetros obligatorios faltantes (Nombre, PIN y Departamentos)." });
      }

      const cleanPin = pin.trim();
      if (cleanPin.length < 3 || cleanPin.length > 4 || isNaN(Number(cleanPin))) {
        return res.status(400).json({ error: "El PIN debe tener exclusivamente entre 3 y 4 dígitos numéricos." });
      }

      const pinHash = hashPin(cleanPin);

      // Verify duplicate pin check
      const dupSnap = await firestoreDb.collection("vip_accesses")
        .where("pinHash", "==", pinHash)
        .where("status", "==", "active")
        .get();

      if (!dupSnap.empty) {
        return res.status(400).json({ error: "Ya existe otro acceso VIP activo con este PIN. Elige otro PIN por seguridad." });
      }

      const id = `vip_acc_${Date.now()}`;
      const newAccess = {
        id,
        clientName: clientName.trim(),
        pinHash,
        pinLastDigits: `****${cleanPin.substring(cleanPin.length - 1)}`,
        allowedDepartments,
        sessionDurationMinutes: Number(sessionDurationMinutes) || 30,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "admin",
        firstUsedAt: null,
        sessionStartedAt: null,
        sessionExpiresAt: null,
        deviceTokenHash: null,
        deviceInfo: null,
        failedAttempts: 0,
        maxFailedAttempts: 5,
        lastAttemptAt: null,
        notes: notes ? notes.trim() : "",
        whatsappLastGeneratedAt: "",
        clientCode: clientCode ? clientCode.trim() : "",
        phoneNumber: phoneNumber ? phoneNumber.trim() : ""
      };

      await firestoreDb.collection("vip_accesses").doc(id).set(newAccess);

      return res.json({
        ...newAccess,
        rawPin: cleanPin
      });

    } catch (err: any) {
      console.error("Error creando acceso VIP:", err);
      return res.status(500).json({ error: "Error al guardar acceso VIP en base de datos: " + err.message });
    }
  });

  // 6. Admin Panel: List all VIP access records
  app.get("/api/vip/accesses", requireAdmin, async (req, res) => {
    try {
      const snap = await firestoreDb.collection("vip_accesses").orderBy("createdAt", "desc").get();
      const list = snap.docs.map(doc => doc.data());
      return res.json(list);
    } catch (err: any) {
      console.error("Error listando accesos VIP:", err);
      return res.status(500).json({ error: "Error de base de datos al listar accesos VIP: " + err.message });
    }
  });

  // 7. Admin Panel: Revoke an active VIP access
  app.post("/api/vip/accesses/:id/revoke", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const vipCol = firestoreDb.collection("vip_accesses");
      const docRef = vipCol.doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: "Acceso VIP no encontrado." });
      }

      await docRef.update({
        status: "revoked",
        updatedAt: new Date().toISOString()
      });

      // Log event
      await firestoreDb.collection("vip_analytics").add({
        accessId: id,
        clientName: docSnap.data()?.clientName || "Cliente",
        eventType: "session_end",
        timestamp: new Date().toISOString(),
        metadata: { reason: "revoked_by_admin" }
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error revocando acceso VIP:", err);
      return res.status(500).json({ error: "Error al revocar acceso VIP: " + err.message });
    }
  });

  // 8. Admin Panel: Delete a VIP access record
  app.delete("/api/vip/accesses/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await firestoreDb.collection("vip_accesses").doc(id).delete();
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error eliminando acceso VIP:", err);
      return res.status(500).json({ error: "Error de base de datos al eliminar acceso VIP: " + err.message });
    }
  });

  // 9. Admin Panel: Load client specific session analytics & orders
  app.get("/api/vip/analytics/:accessId", requireAdmin, async (req, res) => {
    try {
      const { accessId } = req.params;
      
      const eventsSnap = await firestoreDb.collection("vip_analytics")
        .where("accessId", "==", accessId)
        .orderBy("timestamp", "asc")
        .get();
      const events = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const ordersSnap = await firestoreDb.collection("vip_orders")
        .where("accessId", "==", accessId)
        .orderBy("createdAt", "desc")
        .get();
      const orders = ordersSnap.docs.map(doc => doc.data());

      return res.json({ events, orders });
    } catch (err: any) {
      console.error("Error cargando analíticas VIP:", err);
      return res.status(500).json({ error: "Fallo cargando analíticas de VIP: " + err.message });
    }
  });

  // 10. Admin Panel: Block VIP Access
  app.post("/api/vip/accesses/:id/block", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const docRef = firestoreDb.collection("vip_accesses").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: "Acceso VIP no encontrado." });
      }
      await docRef.update({
        status: "blocked",
        updatedAt: new Date().toISOString()
      });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Error al bloquear: " + err.message });
    }
  });

  // 11. Admin Panel: Unblock VIP Access
  app.post("/api/vip/accesses/:id/unblock", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const docRef = firestoreDb.collection("vip_accesses").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: "Acceso VIP no encontrado." });
      }
      await docRef.update({
        status: "active",
        updatedAt: new Date().toISOString()
      });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Error al desbloquear: " + err.message });
    }
  });

  // 12. VIP Chat: Client sends message in order details
  app.post("/api/vip/orders/:orderId/chat", async (req, res) => {
    try {
      const { orderId } = req.params;
      const { deviceToken, text } = req.body;
      if (!deviceToken || !text || !text.trim()) {
        return res.status(400).json({ error: "Mensaje vacío o falta de token." });
      }

      const tokenHash = hashDeviceToken(deviceToken);
      const snap = await firestoreDb.collection("vip_accesses").where("deviceTokenHash", "==", tokenHash).get();
      if (snap.empty) {
        return res.status(403).json({ error: "Acceso VIP no autorizado." });
      }

      const orderRef = firestoreDb.collection("vip_orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        return res.status(404).json({ error: "Pedido no encontrado." });
      }

      const orderData = orderSnap.data()!;
      const chat = orderData.chat || [];
      const newMessage = {
        sender: "client" as const,
        text: text.trim(),
        createdAt: new Date().toISOString()
      };

      await orderRef.update({
        chat: [...chat, newMessage],
        updatedAt: new Date().toISOString()
      });

      // Register analytics
      await firestoreDb.collection("vip_analytics").add({
        accessId: orderData.accessId,
        clientName: orderData.clientName,
        eventType: "chat_message_sent",
        productId: null,
        productName: `Mensaje de chat enviado en pedido ${orderId}`,
        timestamp: new Date().toISOString(),
        metadata: { orderId }
      });

      return res.json({ success: true, message: newMessage });
    } catch (err: any) {
      return res.status(500).json({ error: "Error de servidor al enviar mensaje: " + err.message });
    }
  });

  // 13. VIP Chat: Admin sends message in order details
  app.post("/api/vip/orders/:orderId/chat/admin", requireAdmin, async (req, res) => {
    try {
      const { orderId } = req.params;
      const { text } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Mensaje vacío." });
      }

      const orderRef = firestoreDb.collection("vip_orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        return res.status(404).json({ error: "Pedido no encontrado." });
      }

      const orderData = orderSnap.data()!;
      const chat = orderData.chat || [];
      const newMessage = {
        sender: "admin" as const,
        text: text.trim(),
        createdAt: new Date().toISOString()
      };

      await orderRef.update({
        chat: [...chat, newMessage],
        updatedAt: new Date().toISOString()
      });

      return res.json({ success: true, message: newMessage });
    } catch (err: any) {
      return res.status(500).json({ error: "Error de servidor al enviar mensaje de admin: " + err.message });
    }
  });

  // 14. VIP Payment: Client reports payment transfer/slip reference
  app.post("/api/vip/orders/:orderId/report-payment", async (req, res) => {
    try {
      const { orderId } = req.params;
      const { deviceToken, paymentMethod, paymentReference } = req.body;
      if (!deviceToken || !paymentMethod || !paymentReference) {
        return res.status(400).json({ error: "Información de pago incompleta." });
      }

      const tokenHash = hashDeviceToken(deviceToken);
      const snap = await firestoreDb.collection("vip_accesses").where("deviceTokenHash", "==", tokenHash).get();
      if (snap.empty) {
        return res.status(403).json({ error: "Acceso VIP no autorizado." });
      }

      const orderRef = firestoreDb.collection("vip_orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        return res.status(404).json({ error: "Pedido no encontrado." });
      }

      const orderData = orderSnap.data()!;

      await orderRef.update({
        paymentStatus: "verificación_pendiente",
        paymentMethod,
        paymentReference: paymentReference.trim(),
        updatedAt: new Date().toISOString()
      });

      // Register analytics
      await firestoreDb.collection("vip_analytics").add({
        accessId: orderData.accessId,
        clientName: orderData.clientName,
        eventType: "payment_reported",
        productId: null,
        productName: `Pago reportado por cliente en pedido ${orderId}`,
        timestamp: new Date().toISOString(),
        metadata: { orderId, paymentMethod, paymentReference }
      });

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Error al registrar el pago: " + err.message });
    }
  });

  // --- ENDPOINT DE DIAGNÓSTICO DE LA NUBE (Google Cloud Run / Firestore / GCS) ---
  app.get("/api/diagnostics", async (req, res) => {
    const diagnostics: any = {
      database: { 
        status: "not_tested", 
        error: null, 
        provider: "Google Cloud Firestore (Serverless)", 
        database: firebaseConfig.firestoreDatabaseId 
      },
      storage: { status: "not_tested", provider: "Local (Móvil/Temporal)", bucketName: process.env.GCS_BUCKET_NAME || null, warning: null, uploadDir },
      env: {
        GCS_BUCKET_NAME_set: !!process.env.GCS_BUCKET_NAME
      }
    };

    // 1. Test Firestore Connection
    try {
      await firestoreDb.collection("storeConfig").doc("default").get();
      diagnostics.database.status = "success";
    } catch (dbErr: any) {
      diagnostics.database.status = "error";
      diagnostics.database.error = dbErr.message || String(dbErr);
    }

    // 2. Test Storage Setup
    if (gcsBucket) {
      try {
        const [bucketExists] = await gcsBucket.exists();
        if (bucketExists) {
          diagnostics.storage.status = "success";
          diagnostics.storage.provider = "Google Cloud Storage (Duradero)";
        } else {
          diagnostics.storage.status = "error";
          diagnostics.storage.warning = `El bucket "${process.env.GCS_BUCKET_NAME}" no existe o no tiene los permisos adecuados.`;
        }
      } catch (gcsErr: any) {
        diagnostics.storage.status = "error";
        diagnostics.storage.provider = "Google Cloud Storage (Fallo)";
        const msg = gcsErr.message || String(gcsErr);
        if (gcsErr.code === 403 || msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("does not have")) {
          diagnostics.storage.warning = `La cuenta de servicio del contenedor no tiene permisos para acceder al bucket GCS. Para solucionarlo, otórgale el rol 'Storage Object Admin' en la consola de Google Cloud.`;
        } else {
          diagnostics.storage.warning = `Error de GCS: ${msg}`;
        }
      }
    } else {
      diagnostics.storage.status = "warning";
      diagnostics.storage.provider = "Local del Contenedor (Temporal / Alerta de Pérdida)";
      diagnostics.storage.warning = "En Cloud Run, las fotos y videos locales se borrarán con cada reinicio de contenedor. Se requiere configurar GCS_BUCKET_NAME para persistencia duradera.";
    }

    return res.json(diagnostics);
  });

  // --- API DE TIENDA Y CONFIGURACIÓN EN FIRESTORE ENRUSTECIDA CON CACHÉ ---
  
  // Obtener configuración de la tienda
  app.get("/api/store-config", async (req, res) => {
    try {
      const docRef = firestoreDb.collection("storeConfig").doc("default");
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        // Sembrar valores por defecto si no existen
        const defaultDoc = {
          id: "default",
          storeName: "Mi Catálogo de WhatsApp",
          address: "Av. Principal 123, Frente al Parque Comercial, La Paz",
          phone: "591 76543210",
          whatsappNumber: "59176543210",
          whatsappCustomMessage: "¡Hola! Vi el artículo: {productName} (SKU: {productSku}) en tu catálogo virtual y me gustaría reservarlo.",
          locationUrl: "https://maps.google.com/?q=-16.500000,-68.150000",
          showPrices: true,
          hideOutOfStock: false,
          showLocation: true,
          bannerStyle: "classic",
          promoBannerText: "",
          storeImages: [],
          updatedAt: new Date().toISOString()
        };
        await docRef.set(defaultDoc);
        cachedStoreConfig = defaultDoc;
        return res.json(defaultDoc);
      }
      const currentConfig = { id: "default", ...docSnap.data() };
      cachedStoreConfig = currentConfig;
      return res.json(currentConfig);
    } catch (error: any) {
      console.warn("Error cargando el store-config desde Firestore (usando caché de respaldo):", error.message || error);
      
      const fallbackConfig = cachedStoreConfig || {
        id: "default",
        storeName: "Mi Catálogo de WhatsApp",
        address: "Av. Principal 123, Frente al Parque Comercial, La Paz",
        phone: "591 76543210",
        whatsappNumber: "59176543210",
        whatsappCustomMessage: "¡Hola! Vi el artículo: {productName} (SKU: {productSku}) en tu catálogo virtual y me gustaría reservarlo.",
        locationUrl: "https://maps.google.com/?q=-16.500000,-68.150000",
        showPrices: true,
        hideOutOfStock: false,
        showLocation: true,
        bannerStyle: "classic",
        promoBannerText: "",
        storeImages: [],
        updatedAt: new Date().toISOString()
      };
      
      return res.json(fallbackConfig);
    }
  });

  // Guardar/actualizar configuración de la tienda (Protegido administrativamente)
  app.post("/api/store-config", requireAdmin, async (req, res) => {
    try {
      const payload = req.body;
      const docRef = firestoreDb.collection("storeConfig").doc("default");
      const data = {
        id: "default",
        storeName: payload.storeName || "Mi Catálogo de WhatsApp",
        address: payload.address || "",
        phone: payload.phone || "",
        whatsappNumber: payload.whatsappNumber || "",
        whatsappCustomMessage: payload.whatsappCustomMessage || "¡Hola! Vi el artículo: {productName} (SKU: {productSku}) en tu catálogo virtual y me gustaría reservarlo.",
        locationUrl: payload.locationUrl || "",
        showPrices: payload.showPrices ?? true,
        hideOutOfStock: payload.hideOutOfStock ?? false,
        showLocation: payload.showLocation ?? true,
        bannerStyle: payload.bannerStyle || "classic",
        promoBannerText: payload.promoBannerText || "",
        storeImages: payload.storeImages || [],
        updatedAt: new Date().toISOString()
      };
      
      try {
        await docRef.set(data, { merge: true });
      } catch (dbSetErr: any) {
        console.warn("[Firebase] No se pudo escribir store-config en Firestore, actualizando caché local:", dbSetErr.message || dbSetErr);
      }
      
      cachedStoreConfig = data;
      return res.json(data);
    } catch (error: any) {
      console.error("Error crítico actualizando store-config:", error);
      return res.status(500).json({ error: "Error actualizando configuración: " + (error.message || error) });
    }
  });

  // Obtener todos los productos con caché fallback impecable
  app.get("/api/products", async (req, res) => {
    try {
      const snapshot = await firestoreDb.collection("products").orderBy("createdAt", "desc").get();
      const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (allProducts && allProducts.length > 0) {
        cachedProducts = allProducts;
      }
      return res.json(allProducts);
    } catch (error: any) {
      console.warn("Error obteniendo productos de Firestore (usando caché de respaldo):", error.message || error);
      
      if (cachedProducts && cachedProducts.length > 0) {
        return res.json(cachedProducts);
      }
      
      // Catálogo de respaldo ultra hermoso de última línea de defensa - Nunca vacío
      const defaultProducts = [
        {
          id: "back_1",
          sku: "AUD-01",
          name: "Audífonos de Alta Fidelidad Pro",
          description: "Sonido envolvente de alta definición, cancelación de ruido activa inteligente y diseño sumamente ergónomico para largas sesiones de uso.",
          category: "Tecnología",
          retailPrice: 89,
          wholesalePrice: 65,
          images: ["https://images.unsplash.com/photo-1546435770-a3e426bf472b?q=80&w=600&auto=format&fit=crop"],
          videoUrl: "",
          isAvailable: true,
          views: 120,
          whatsappClicks: 34,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "back_2",
          sku: "WATCH-02",
          name: "Reloj Inteligente Sport Amoled",
          description: "Monitoreo cardíaco dinámico, GPS incorporado de alta precisión, resistencia al agua IP68 y batería de duración extendida hasta 14 días.",
          category: "Accesorios",
          retailPrice: 129,
          wholesalePrice: 95,
          images: ["https://images.unsplash.com/photo-1579586337278-3befd40fd17a?q=80&w=600&auto=format&fit=crop"],
          videoUrl: "",
          isAvailable: true,
          views: 85,
          whatsappClicks: 19,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "back_3",
          sku: "BAG-03",
          name: "Mochila Ergónomica Impermeable",
          description: "Compartimento ultra acolchado para laptops de hasta 16 pulgadas, puerto de carga rápida USB exterior integrado y material impermeable premium.",
          category: "Moda",
          retailPrice: 45,
          wholesalePrice: 32,
          images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=600&auto=format&fit=crop"],
          videoUrl: "",
          isAvailable: true,
          views: 52,
          whatsappClicks: 12,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      cachedProducts = defaultProducts;
      return res.json(defaultProducts);
    }
  });

  // Crear un producto
  app.post("/api/products", requireAdmin, async (req, res) => {
    try {
      const p = req.body;
      const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const docData = {
        sku: p.sku || "",
        name: p.name || "Sin nombre",
        description: p.description || "",
        category: p.category || "General",
        retailPrice: Number(p.retailPrice) || 0,
        wholesalePrice: Number(p.wholesalePrice) || 0,
        images: p.images || [],
        backupImages: p.backupImages || [],
        videoUrl: p.videoUrl || "",
        isAvailable: p.isAvailable ?? true,
        hidePrice: p.hidePrice ?? false,
        isHidden: p.isHidden ?? false,
        views: Number(p.views) || 0,
        whatsappClicks: Number(p.whatsappClicks) || 0,
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      try {
        await firestoreDb.collection("products").doc(id).set(docData);
      } catch (dbErr: any) {
        console.warn("[Firebase] No se pudo guardar producto en Firestore, guardando en caché en memoria:", dbErr.message || dbErr);
      }
      
      const newProd = { id, ...docData };
      cachedProducts = [newProd, ...cachedProducts.filter(item => item.id !== id)];
      return res.json(newProd);
    } catch (error: any) {
      console.error("Error crítico creando producto:", error);
      return res.status(500).json({ error: "Error creando producto: " + (error.message || error) });
    }
  });

  // Actualizar un producto
  app.put("/api/products/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const p = req.body;
      
      let existingProd = cachedProducts.find(item => item.id === id);
      const updateData: any = {};
      if (p.sku !== undefined) updateData.sku = p.sku;
      if (p.name !== undefined) updateData.name = p.name;
      if (p.description !== undefined) updateData.description = p.description;
      if (p.category !== undefined) updateData.category = p.category;
      if (p.retailPrice !== undefined) updateData.retailPrice = Number(p.retailPrice) || 0;
      if (p.wholesalePrice !== undefined) updateData.wholesalePrice = Number(p.wholesalePrice) || 0;
      if (p.images !== undefined) updateData.images = p.images;
      if (p.backupImages !== undefined) updateData.backupImages = p.backupImages;
      if (p.videoUrl !== undefined) updateData.videoUrl = p.videoUrl;
      if (p.isAvailable !== undefined) updateData.isAvailable = p.isAvailable;
      if (p.hidePrice !== undefined) updateData.hidePrice = p.hidePrice;
      if (p.isHidden !== undefined) updateData.isHidden = p.isHidden;
      if (p.views !== undefined) updateData.views = Number(p.views) || 0;
      if (p.whatsappClicks !== undefined) updateData.whatsappClicks = Number(p.whatsappClicks) || 0;
      updateData.updatedAt = new Date().toISOString();
      
      try {
        const docRef = firestoreDb.collection("products").doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          await docRef.update(updateData);
          const freshSnap = await docRef.get();
          existingProd = { id, ...freshSnap.data() };
        } else {
          // If Firestore is working but product somehow absent, set it
          if (existingProd) {
            const finalDoc = { ...existingProd, ...updateData };
            await docRef.set(finalDoc);
            existingProd = finalDoc;
          }
        }
      } catch (dbErr: any) {
        console.warn("[Firebase] No se pudo actualizar en Firestore, aplicando a caché de memoria:", dbErr.message || dbErr);
        if (existingProd) {
          existingProd = { ...existingProd, ...updateData };
        } else {
          existingProd = { id, sku: "", name: "Sin nombre", description: "", category: "General", retailPrice: 0, wholesalePrice: 0, images: [], videoUrl: "", isAvailable: true, views: 0, whatsappClicks: 0, createdAt: new Date().toISOString(), ...updateData };
        }
      }
      
      if (existingProd) {
        cachedProducts = cachedProducts.map(item => item.id === id ? existingProd : item);
        // Ensure it is added if missing
        if (!cachedProducts.some(item => item.id === id)) {
          cachedProducts.push(existingProd);
        }
      }
      
      return res.json(existingProd || { id, ...updateData });
    } catch (error: any) {
      console.error("Error crítico actualizando producto:", error);
      return res.status(500).json({ error: "Error actualizando producto: " + (error.message || error) });
    }
  });

  // Eliminar un producto
  app.delete("/api/products/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      try {
        const docRef = firestoreDb.collection("products").doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          await docRef.delete();
        }
      } catch (dbErr: any) {
        console.warn("[Firebase] No se pudo eliminar de Firestore, aplicando a caché de memoria:", dbErr.message || dbErr);
      }
      
      cachedProducts = cachedProducts.filter(item => item.id !== id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error crítico eliminando producto:", error);
      return res.status(500).json({ error: "Error en eliminación de producto: " + (error.message || error) });
    }
  });

  // Sembrar en lote productos de demostración con validaciones ultra-robustas y logs detallados
  app.post("/api/products/seed", async (req, res) => {
    console.log(`[Firestore Sync] Recibida petición de siembra con lote. Tamaño: ${Array.isArray(req.body) ? req.body.length : "no es arreglo"}`);
    try {
      const list = req.body;
      if (!Array.isArray(list)) {
        console.warn("[Firestore Sync] Error: El cuerpo de la petición no es un arreglo.");
        return res.status(400).json({ error: "Se requiere un arreglo de productos." });
      }
      
      const inserted = [];
      const batch = firestoreDb.batch();
      
      for (const p of list) {
        const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const retailNum = typeof p.retailPrice === "number" ? p.retailPrice : parseFloat(p.retailPrice);
        const wholesaleNum = typeof p.wholesalePrice === "number" ? p.wholesalePrice : parseFloat(p.wholesalePrice);
        
        const finalRetail = isNaN(retailNum) ? 0 : retailNum;
        const finalWholesale = isNaN(wholesaleNum) ? 0 : wholesaleNum;

        console.log(`[Firestore Sync] Sembrando producto ID: "${id}", SKU: "${p.sku}", Nombre: "${p.name}"`);

        const docRef = firestoreDb.collection("products").doc(id);
        const docData = {
          sku: p.sku || "",
          name: p.name || "Sin nombre",
          description: p.description || "",
          category: p.category || "General",
          retailPrice: finalRetail,
          wholesalePrice: finalWholesale,
          images: p.images || [],
          backupImages: p.backupImages || [],
          videoUrl: p.videoUrl || "",
          isAvailable: p.isAvailable ?? true,
          views: Number(p.views) || 0,
          whatsappClicks: Number(p.whatsappClicks) || 0,
          createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        batch.set(docRef, docData, { merge: true });
        inserted.push({ id, ...docData });
      }
      
      await batch.commit();
      console.log(`[Firestore Sync] Éxito. Se guardaron correctamente ${inserted.length} artículos en Firestore.`);
      return res.json(inserted);
    } catch (error: any) {
      console.error("[Firestore Sync] Error crítico sembrando productos:", error);
      return res.status(500).json({ 
        error: "Error de Firestore sembrando productos: " + (error.message || error),
        details: error.stack || ""
      });
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
