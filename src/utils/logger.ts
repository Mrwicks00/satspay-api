import { createLogger, format, transports } from "winston";
import { env } from "../config/env.js";
import fs from "node:fs";
import path from "node:path";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const { combine, timestamp, colorize, printf, json } = format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const prodFormat = combine(timestamp(), json());

const coreTransports: any[] = [new transports.Console()];

export const logger = createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: env.NODE_ENV === "production" ? prodFormat : devFormat,
  transports: coreTransports,
});
