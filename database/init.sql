-- OPCIONAL. No es necesario para instalar: el sistema crea la base de datos solo usando el usuario de config.env.
-- Úselo cuando pase a producción y quiera un usuario MySQL dedicado en lugar de root:
--   1. Cambie la contraseña de abajo.
--   2. Ejecútelo en MySQL Workbench conectado como root.
--   3. En config.env ponga DB_USER=monitor_user y DB_PASSWORD=<la contraseña>, y reinicie con INICIAR.bat.
CREATE DATABASE IF NOT EXISTS monitor_red CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'monitor_user'@'127.0.0.1' IDENTIFIED BY 'Cambia_Esta_Clave_123!';
CREATE USER IF NOT EXISTS 'monitor_user'@'localhost' IDENTIFIED BY 'Cambia_Esta_Clave_123!';
ALTER USER 'monitor_user'@'127.0.0.1' IDENTIFIED BY 'Cambia_Esta_Clave_123!';
ALTER USER 'monitor_user'@'localhost' IDENTIFIED BY 'Cambia_Esta_Clave_123!';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON monitor_red.* TO 'monitor_user'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON monitor_red.* TO 'monitor_user'@'localhost';
FLUSH PRIVILEGES;
