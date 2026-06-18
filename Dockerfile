# Usar imagen base oficial de Node.js (versión ligera)
FROM node:20-alpine

# Definir el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar archivos de configuración de dependencias
COPY package*.json ./

# Instalar todas las dependencias necesarias para compilar el proyecto
RUN npm ci

# Copiar el resto de archivos del código fuente de la aplicación
COPY . .

# Compilar la aplicación (genera la carpeta dist/ con el frontend y el servidor compilado)
RUN npm run build

# Configurar variables de entorno indispensables para producción
ENV NODE_ENV=production
ENV PORT=3000

# Exponer el puerto por defecto (Cloud Run lo mapeará dinámicamente)
EXPOSE 3000

# Comando para iniciar la aplicación servidor en Cloud Run
CMD ["npm", "run", "start"]
