import path from "node:path";
import { z } from "zod";
const env = z
  .object({
    LOGGING_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    LOG_OUTBOX_DIR: z.string().default("./.log-outbox"),
    LOG_MAX_FIELD_CHARACTERS: z.coerce
      .number()
      .int()
      .min(100)
      .max(100000)
      .default(16000),
    LOG_MAX_PAYLOAD_CHARACTERS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(1000000)
      .default(64000),
    FIREBASE_PROJECT_ID: z.string().trim().default(""),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(9090),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    DB_HOST: z.string().default("127.0.0.1"),
    DB_PORT: z.coerce.number().int().default(5432),
    DB_NAME: z
      .string()
      .regex(/^[a-zA-Z0-9_]+$/)
      .default("laidoff"),
    DB_USER: z.string().default("laidoff"),
    DB_PASSWORD: z.string().default(""),
    DB_SSL: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DB_SSL_REJECT_UNAUTHORIZED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    UPLOAD_DIR: z.string().default("./uploads"),
    PRIVATE_UPLOAD_DIR: z.string().default("./private-uploads"),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  })
  .parse(process.env);
export const config = {
  ...env,
  origins: env.CORS_ORIGINS.split(",")
    .map((v) => v.trim())
    .filter(Boolean),
  logOutboxDir: path.resolve(env.LOG_OUTBOX_DIR),
  uploadDir: path.resolve(env.UPLOAD_DIR),
  privateUploadDir: path.resolve(env.PRIVATE_UPLOAD_DIR),
};
