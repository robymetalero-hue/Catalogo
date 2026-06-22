/**
 * Valida un archivo de imagen verificando formato, tamaño y corrupción.
 * @param file Objeto File de la imagen seleccionada.
 * @returns Promesa que se resuelve con un mensaje de error claro en caso de falla, o null si es válido.
 */
export function validateImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    // 1. Validar formato permitido (solo JPG, PNG, WEBP)
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["jpg", "jpeg", "png", "webp"];

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext || "")) {
      resolve(`Formato inválido: solo se permiten imágenes en formato JPG, PNG o WEBP.`);
      return;
    }

    // 2. Validar tamaño máximo (5MB)
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      resolve(`Archivo demasiado grande: la imagen supera el límite de 5 MB.`);
      return;
    }

    // 3. Validar si el archivo es corrupto / vacío
    if (file.size === 0) {
      resolve(`Archivo inválido: el archivo seleccionado está vacío o dañado.`);
      return;
    }

    // Intentar leer la imagen usando el constructor Image() para corroborar que no sea un archivo corrupto
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null); // Es una imagen válida
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(`Archivo corrupto: el archivo no pudo cargarse o no contiene una imagen válida.`);
    };

    img.src = objectUrl;
  });
}
