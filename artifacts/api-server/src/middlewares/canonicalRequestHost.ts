import type { RequestHandler } from "express";
import { applyCanonicalRequestHost } from "../lib/public-origin";

export function canonicalRequestHostMiddleware(): RequestHandler {
  return (req, _res, next) => {
    applyCanonicalRequestHost(req);
    next();
  };
}
