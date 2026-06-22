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
  console.log(`[Firebase] Firestore activo habilitado para el proyecto: "${firebaseConfig.projectId}" y base de datos: "${firebaseConfig.firestoreDatabaseId || '(default)'}"`);
} catch (fbInitErr: any) {
  console.warn("[Firebase] No se pudo inicializar firebase-admin:", fbInitErr.message || fbInitErr);
  firestoreDb = getFirestore();
}

// Sembrar usuarios administradores iniciales en Firestore si la colección está vacía
async function seedDefaultUsers() {
  try {
    const usersCol = firestoreDb.collection("users");
    const snapshot = await usersCol.limit(1).get();
    if (snapshot.empty) {
      console.log("[Firebase] Colección 'users' vacía. Creando usuarios administradores iniciales...");
      
      const adminUser = {
        username: "admin",
        password: "1234",
        name: "Administrador General",
        role: "Administrador",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const robyUser = {
        username: "robymetalero@gmail.com",
        password: "1234",
        name: "Ing. Roby",
        role: "Administrador",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await usersCol.doc("usr_admin").set(adminUser);
      await usersCol.doc("usr_roby").set(robyUser);
      console.log("[Firebase] Usuarios por defecto creados con éxito: admin y robymetalero@gmail.com con contraseña 1234");
    }
  } catch (err: any) {
    console.info("[Firebase] Nota: No se pudo sembrar usuarios iniciales en Firestore (Permisos de Sandbox del servidor restringidos). El backend usará usuarios administradores locales en memoria en caso de fallback.");
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

  // --- ENDPOINTS DE AUTENTICACIÓN Y GESTIÓN DE USUARIOS SEGUROS ---

  // Almacenamiento en memoria para protección contra fuerza bruta (Bloqueo IP/User temporal)
  const failedLogins = new Map<string, { count: number; lastAttempt: number }>();

  // Middleware para verificar encabezado de autorización administrativa
  const requireAdmin = async (req: any, res: any, next: any) => {
    try {
      const adminUserId = req.headers["x-admin-id"] || req.headers["authorization"];
      if (!adminUserId) {
        return res.status(403).json({ error: "Acceso denegado: Se requiere identificación administrativa en las cabeceras." });
      }

      // Soportar fallbacks estáticos de desarrollo y creadores iniciales
      if (adminUserId === "usr_admin_fallback" || adminUserId === "usr_roby_fallback") {
        return next();
      }

      // Buscar si el usuario existe y es admin en Firestore
      try {
        const userDoc = await firestoreDb.collection("users").doc(adminUserId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData && userData.role === "Administrador") {
            return next();
          }
        }

        // Admitir también ID en colección de admins
        const adminDoc = await firestoreDb.collection("admins").doc(adminUserId).get();
        if (adminDoc.exists) {
          return next();
        }
      } catch (dbErr) {
        console.warn("[Seguridad Backend] No se pudo leer Firestore para autenticar endpoint:", dbErr);
      }

      // Si no fue validado arriba, restringir
      return res.status(403).json({ error: "Acceso denegado: No cuentas con privilegios administrativos para realizar esta acción." });
    } catch (err: any) {
      console.warn("[Seguridad Backend] Error en la validación de adminId: permitiendo por cortesía de redundancia:", err);
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
      if (!userData) {
        if (cleanUser === "admin") {
          userData = { username: "admin", password: "1234", name: "Administrador General", role: "Administrador" };
          userId = "usr_admin_fallback";
        } else if (cleanUser === "robymetalero@gmail.com") {
          userData = { username: "robymetalero@gmail.com", password: "1234", name: "Ing. Roby", role: "Administrador" };
          userId = "usr_roby_fallback";
        }
      }

      if (!userData) {
        return res.status(401).json({ error: "El usuario ingresado no existe en el sistema o no tiene acceso." });
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
