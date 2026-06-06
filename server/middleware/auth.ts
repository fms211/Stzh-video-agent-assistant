import type { Request, Response, NextFunction } from "express";

const API_SECRET_KEY = process.env.API_SECRET_KEY;

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 未配置 API_SECRET_KEY 时跳过鉴权
  if (!API_SECRET_KEY) {
    return next();
  }

  const key = req.headers["x-api-key"];
  if (key !== API_SECRET_KEY) {
    return res.status(401).json({ error: { message: "Invalid or missing API key" } });
  }

  next();
}
